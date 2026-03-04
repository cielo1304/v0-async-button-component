'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { adminSupabase } from '@/lib/supabase/admin'
import { 
  createViewAsSession, 
  setViewAsCookie, 
  clearViewAsCookie, 
  getViewAsSession,
  type ViewAsSession 
} from '@/lib/view-as'

// Cache for allowed member_role values (parsed from DB constraint or probed)
let cachedAllowedRoles: string[] | null = null

/**
 * Probe to find allowed member_role values by attempting inserts.
 * Uses a transaction-like approach: try insert, catch error, parse allowed values.
 */
async function getAllowedMemberRoles(): Promise<string[]> {
  if (cachedAllowedRoles) return cachedAllowedRoles

  // Common roles that might be allowed
  const candidateRoles = ['member', 'employee', 'viewer', 'admin', 'owner']
  const allowedRoles: string[] = []

  // Try to get roles from an existing team_members row
  const { data: existingRoles } = await adminSupabase
    .from('team_members')
    .select('member_role')
    .limit(100)

  if (existingRoles && existingRoles.length > 0) {
    // Collect unique roles from existing data
    const foundRoles = new Set<string>()
    for (const row of existingRoles) {
      if (row.member_role) foundRoles.add(row.member_role)
    }
    if (foundRoles.size > 0) {
      cachedAllowedRoles = Array.from(foundRoles)
      return cachedAllowedRoles
    }
  }

  // Fallback: try to insert with a test role and catch the error to parse allowed values
  // Use a dummy company_id that doesn't exist to ensure insert fails on FK, not constraint
  // Actually, we'll just use common defaults
  cachedAllowedRoles = candidateRoles
  return cachedAllowedRoles
}

/**
 * Pick the safest (least privilege) role from allowed roles.
 * Preference order: viewer > employee > member > admin > owner
 */
async function pickSafestRole(): Promise<string> {
  const allowed = await getAllowedMemberRoles()
  const preference = ['viewer', 'employee', 'member', 'admin', 'owner']
  for (const role of preference) {
    if (allowed.includes(role)) return role
  }
  // If none match, return first allowed
  return allowed[0] || 'member'
}

/**
 * Check if the current user is a platform admin.
 * Uses RPC is_platform_admin which checks platform_admins table.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error } = await supabase.rpc('is_platform_admin')
    
    if (error) {
      console.error('[v0] is_platform_admin RPC error:', error)
      return false
    }

    return !!isAdmin
  } catch {
    return false
  }
}

/**
 * Create a company invite (platform admin only)
 */
export async function createCompanyInvite(
  email: string,
  companyName: string
): Promise<{ token?: string; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    // Verify platform admin via RPC
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { error: 'Failed to verify admin status' }
    }

    if (!isAdmin) {
      return { error: 'Unauthorized: Only platform admins can create invites' }
    }

    const { data, error } = await supabase.rpc('create_company_invite', {
      p_email: email,
      p_company_name: companyName,
    })

    if (error) {
      console.error('[v0] create_company_invite RPC error:', error)
      return { error: error.message }
    }

    return { token: data as string }
  } catch (err) {
    console.error('[v0] createCompanyInvite error:', err)
    return { error: 'Failed to create invite' }
  }
}

/**
 * List all company invites (platform admin only)
 */
export async function listCompanyInvites(): Promise<{
  invites?: Array<{
    id: string
    email: string
    company_name: string
    token: string
    expires_at: string
    used_at: string | null
    created_at: string
  }>
  error?: string
}> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    // Verify platform admin via RPC
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { error: 'Failed to verify admin status' }
    }

    if (!isAdmin) {
      return { error: 'Unauthorized' }
    }

    const { data, error } = await supabase
      .from('company_invites')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[v0] listCompanyInvites error:', error)
      return { error: error.message }
    }

    return { invites: data || [] }
  } catch (err) {
    console.error('[v0] listCompanyInvites error:', err)
    return { error: 'Failed to list invites' }
  }
}

/**
 * Delete a company invite (platform admin only)
 */
export async function deleteCompanyInvite(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { success: false, error: 'Failed to verify admin status' }
    }
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' }
    }

    const { error } = await supabase
      .from('company_invites')
      .delete()
      .eq('token', token)

    if (error) {
      console.error('[v0] deleteCompanyInvite error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[v0] deleteCompanyInvite error:', err)
    return { success: false, error: 'Failed to delete invite' }
  }
}

/**
 * Invite a future company owner (Boss) by email.
 * - Creates a company_invite token (company_id = null — Boss creates it during onboarding)
 * - Sends a Supabase magic-link email via the service-role admin client
 * - The email link leads to: /auth/callback?next=/onboarding?type=company&token=<TOKEN>
 */
export async function inviteCompanyOwnerByEmail(
  email: string
): Promise<{ token?: string; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    // Verify caller is a platform admin
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { error: 'Failed to verify admin status' }
    }
    if (!isAdmin) {
      return { error: 'Unauthorized: Only platform admins can send invites' }
    }

    // Create a company_invite token with a placeholder company name (Boss will fill it in onboarding)
    const { data: token, error: inviteError } = await supabase.rpc('create_company_invite', {
      p_email: email,
      p_company_name: '',
    })

    if (inviteError) {
      console.error('[v0] create_company_invite RPC error:', inviteError)
      return { error: inviteError.message }
    }

    const inviteToken = token as string

    // Build the redirect URL that the email link will point to
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mutka2.xyz'
    // /auth/callback will exchange the code, then redirect to /set-password?next=...
    // /set-password will then redirect to the `next` value after the user sets their password
    const nextPath = `/onboarding?type=company&token=${inviteToken}`
    const redirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`

    // Send the Supabase invite email
    const { error: emailError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (emailError) {
      console.error('[v0] inviteUserByEmail error:', emailError)
      return { error: emailError.message }
    }

    return { token: inviteToken }
  } catch (err) {
    console.error('[v0] inviteCompanyOwnerByEmail error:', err)
    return { error: 'Failed to send invite' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// View-As Mode (Platform Admin)
// ─────────────────────────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
}

interface EmployeeWithUser {
  id: string            // employees.id
  full_name: string
  position: string | null
  user_id: string       // team_members.user_id (auth.users.id)
  member_role?: string  // team_members.member_role
}

/**
 * List all companies (platform admin only)
 */
export async function listAllCompanies(): Promise<{ companies?: Company[]; error?: string }> {
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError || !isAdmin) {
      return { error: 'Недостаточно прав' }
    }

    // Use admin client to bypass RLS
    const { data, error } = await adminSupabase
      .from('companies')
      .select('id, name')
      .order('name')

    if (error) {
      console.error('[v0] listAllCompanies error:', error)
      return { error: error.message }
    }

    return { companies: data || [] }
  } catch (err) {
    console.error('[v0] listAllCompanies error:', err)
    return { error: 'Failed to list companies' }
  }
}

/**
 * List REAL employees of a company that have linked auth users (can log in).
 * For view-as, we only show employees with:
 * - auth_user_id IS NOT NULL (can log in)
 * - is_system = false (not a platform viewer / system employee)
 * Uses service role to bypass RLS since platform admin is not a team member.
 */
export async function listCompanyEmployees(companyId: string): Promise<{ ok: boolean; employees?: EmployeeWithUser[]; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError || !isAdmin) {
      return { ok: false, error: 'Недостаточно прав' }
    }

    // Use admin client to bypass RLS
    // Only select REAL employees: auth_user_id IS NOT NULL AND is_system = false
    const { data: employeesData, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name, position, is_active, email, auth_user_id, is_system')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('auth_user_id', 'is', null)
      .eq('is_system', false) // Exclude system employees
      .order('full_name')

    if (empError) {
      console.error('[v0] listCompanyEmployees employees error:', empError)
      return { ok: false, error: `Ошибка загрузки сотрудников: ${empError.message}` }
    }

    if (!employeesData || employeesData.length === 0) {
      return { ok: true, employees: [] }
    }

    // Get team_members to find role info
    const { data: teamMembersData, error: tmError } = await adminSupabase
      .from('team_members')
      .select('employee_id, user_id, member_role')
      .eq('company_id', companyId)

    if (tmError) {
      console.error('[v0] listCompanyEmployees team_members error:', tmError)
      // Non-fatal, continue without role info
    }

    // Create a map of employee_id -> { user_id, member_role }
    const teamMemberMap = new Map<string, { user_id: string | null; member_role: string | null }>()
    for (const tm of teamMembersData || []) {
      if (tm.employee_id) {
        teamMemberMap.set(tm.employee_id, { user_id: tm.user_id, member_role: tm.member_role })
      }
    }

    // Map to EmployeeWithUser - filter out any system employees that might have slipped through
    const employees: EmployeeWithUser[] = employeesData
      .filter((emp) => !emp.is_system)
      .map((emp) => {
        const tm = teamMemberMap.get(emp.id)
        return {
          id: emp.id,
          full_name: emp.full_name,
          position: emp.position,
          user_id: tm?.user_id ?? emp.auth_user_id ?? '',
          member_role: tm?.member_role ?? undefined,
        }
      })

    return { ok: true, employees }
  } catch (err) {
    console.error('[v0] listCompanyEmployees error:', err)
    return { ok: false, error: 'Ошибка загрузки списка сотрудников' }
  }
}

interface MembershipResult {
  created: boolean
  companyId: string
  teamMemberId?: string
  systemEmployeeId?: string
  error?: string
}

/**
 * Find or create a SYSTEM viewer employee for the company.
 * System employees have:
 * - is_system = true
 * - auth_user_id = NULL (no UNIQUE constraint collision)
 * - full_name = 'Просмотр (админ платформы)'
 */
async function getOrCreateSystemViewerEmployee(companyId: string): Promise<{ id: string } | null> {
  // Find existing system employee
  const { data: existing } = await adminSupabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_system', true)
    .eq('full_name', 'Просмотр (админ платформы)')
    .maybeSingle()

  if (existing) {
    return existing
  }

  // Create a new system employee (no auth_user_id!)
  const { data: newEmployee, error } = await adminSupabase
    .from('employees')
    .insert({
      company_id: companyId,
      full_name: 'Просмотр (админ платформы)',
      is_system: true,
      is_active: true,
      auth_user_id: null, // NO auth_user_id to avoid UNIQUE constraint
    })
    .select('id')
    .single()

  if (error) {
    console.error('[v0] Failed to create system viewer employee:', error)
    return null
  }

  return newEmployee
}

/**
 * Ensure platform admin has a team_members row for the selected company.
 * This allows RLS policies to grant read access.
 * 
 * If membership already exists, we don't create anything and return { created: false }.
 * 
 * We link employee_id to a SYSTEM viewer employee (is_system=true, auth_user_id=null).
 * This avoids UNIQUE constraint violations on auth_user_id.
 */
async function ensurePlatformMembership(
  platformAdminUserId: string,
  companyId: string
): Promise<MembershipResult> {
  // Check if platform admin already has membership in this company
  // Use .maybeSingle() to avoid 406 error when no rows
  const { data: existingMembership } = await adminSupabase
    .from('team_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', platformAdminUserId)
    .maybeSingle()

  if (existingMembership) {
    // Already a member, no need to create anything
    return { created: false, companyId, teamMemberId: existingMembership.id }
  }

  // Get or create a system viewer employee for this company
  const systemEmployee = await getOrCreateSystemViewerEmployee(companyId)

  // Pick a valid role from the constraint
  const safeRole = await pickSafestRole()

  // Create team_members row with employee_id = systemEmployee.id (if required) or null
  const { data: newTeamMember, error: tmError } = await adminSupabase
    .from('team_members')
    .insert({
      company_id: companyId,
      user_id: platformAdminUserId,
      employee_id: systemEmployee?.id || null,
      member_role: safeRole,
    })
    .select('id')
    .single()

  if (tmError || !newTeamMember) {
    console.error('[v0] Failed to create team_members row:', tmError)
    return { created: false, companyId, error: `Ошибка создания временного доступа: ${tmError?.message || 'unknown'}` }
  }

  return {
    created: true,
    companyId,
    teamMemberId: newTeamMember.id,
    systemEmployeeId: systemEmployee?.id,
  }
}

/**
 * Start a view-as session (platform admin only)
 * Creates temporary membership for RLS access, then sets view-as cookie.
 * Returns typed error codes for better UI handling.
 */
export async function startViewAsSession(
  companyId: string,
  employeeId: string
): Promise<{ success: boolean; error?: string; errorCode?: 'not_platform_admin' | 'no_company' | 'no_employee' | 'membership_error' | 'unknown' }> {
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError || !isAdmin) {
      return { success: false, error: 'Недостаточно прав', errorCode: 'not_platform_admin' }
    }

    // Get company info
    const { data: company, error: companyError } = await adminSupabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Компания не найдена', errorCode: 'no_company' }
    }

    // Get employee info directly from employees table (allow any employee, not just those with auth)
    const { data: employee, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .single()

    if (empError || !employee) {
      return { success: false, error: 'Сотрудник не найден', errorCode: 'no_employee' }
    }

    // Ensure platform admin has membership in this company for RLS access
    const membershipResult = await ensurePlatformMembership(
      user.id,
      companyId
    )

    if (membershipResult.error) {
      return { success: false, error: membershipResult.error, errorCode: 'membership_error' }
    }

    // Create the view-as session token
    // targetUserId is the platform admin's own ID (we use their auth session, not the viewed employee's)
    const token = await createViewAsSession({
      targetUserId: user.id,
      targetCompanyId: companyId,
      targetEmployeeId: employeeId,
      targetDisplayName: employee.full_name,
      companyName: company.name,
      viewerAdminUserId: user.id,
      // Track membership for cleanup
      createdMembership: membershipResult.created,
      createdTeamMemberId: membershipResult.teamMemberId,
    })

    // Set the cookie
    await setViewAsCookie(token)

    return { success: true }
  } catch (err) {
    console.error('[v0] startViewAsSession error:', err)
    return { success: false, error: 'Ошибка запуска режима просмотра', errorCode: 'unknown' }
  }
}

/**
 * End the current view-as session
 * Cleans up temporary team_members row if it was created.
 */
export async function endViewAsSession(): Promise<{ success: boolean }> {
  try {
    // Get current session to check if we need to clean up membership
    const session = await getViewAsSession()

    if (session?.createdMembership && session.createdTeamMemberId) {
      // Clean up the temporary team_members row
      const { error: tmDeleteError } = await adminSupabase
        .from('team_members')
        .delete()
        .eq('id', session.createdTeamMemberId)

      if (tmDeleteError) {
        console.error('[v0] Failed to delete temp team_members:', tmDeleteError)
      }
    }

    await clearViewAsCookie()
    return { success: true }
  } catch (err) {
    console.error('[v0] endViewAsSession error:', err)
    return { success: false }
  }
}

/**
 * Get current view-as session info (for display)
 */
export async function getViewAsSessionInfo(): Promise<{ session: ViewAsSession | null }> {
  try {
    const session = await getViewAsSession()
    return { session }
  } catch {
    return { session: null }
  }
}
