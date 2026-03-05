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

// Viewer employee name prefix for cleanup
const VIEWER_EMPLOYEE_NAME = 'Просмотр (админ платформы)'

/**
 * Clean up old viewer artifacts for a platform admin user.
 * Deletes team_members and employees rows from previous view-as sessions.
 */
async function cleanupOldViewerArtifacts(platformAdminUserId: string): Promise<void> {
  try {
    // Find all team_members rows for this user that are linked to viewer employees
    const { data: teamMembers } = await adminSupabase
      .from('team_members')
      .select('id, employee_id')
      .eq('user_id', platformAdminUserId)

    if (!teamMembers || teamMembers.length === 0) return

    // For each team_member, check if the linked employee is a viewer employee
    for (const tm of teamMembers) {
      if (!tm.employee_id) continue

      // Check if employee is a viewer employee (by name prefix)
      const { data: employee } = await adminSupabase
        .from('employees')
        .select('id, full_name')
        .eq('id', tm.employee_id)
        .maybeSingle()

      if (employee && employee.full_name?.startsWith(VIEWER_EMPLOYEE_NAME)) {
        // Delete team_member first (due to FK constraints)
        await adminSupabase
          .from('team_members')
          .delete()
          .eq('id', tm.id)

        // Delete viewer employee
        await adminSupabase
          .from('employees')
          .delete()
          .eq('id', employee.id)
      }
    }
  } catch (err) {
    console.error('[v0] cleanupOldViewerArtifacts error:', err)
    // Non-fatal, continue
  }
}

/**
 * Find or create a SYSTEM viewer employee for the company.
 * System employees have:
 * - is_system = true (if column exists)
 * - auth_user_id = NULL (critical to avoid UNIQUE constraint collision)
 * - full_name = 'Просмотр (админ платформы)'
 * 
 * Handles gracefully if is_system column doesn't exist.
 */
async function getOrCreateSystemViewerEmployee(companyId: string): Promise<{ id: string } | null> {
  // Try to find existing system employee
  // First try with is_system filter
  let existing: { id: string } | null = null
  
  const { data: existingWithIsSystem, error: existingError } = await adminSupabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_system', true)
    .eq('full_name', VIEWER_EMPLOYEE_NAME)
    .maybeSingle()

  if (!existingError && existingWithIsSystem) {
    existing = existingWithIsSystem
  } else {
    // Fallback: search by name prefix only (is_system column might not exist)
    const { data: existingByName } = await adminSupabase
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('full_name', VIEWER_EMPLOYEE_NAME)
      .is('auth_user_id', null) // Viewer employees have null auth_user_id
      .maybeSingle()

    if (existingByName) {
      existing = existingByName
    }
  }

  if (existing) {
    return existing
  }

  // Create a new system employee
  // Try with is_system first, fallback without if column doesn't exist
  const baseInsert = {
    company_id: companyId,
    full_name: VIEWER_EMPLOYEE_NAME,
    is_active: true,
    auth_user_id: null, // CRITICAL: no auth_user_id to avoid UNIQUE constraint
  }

  // Try with is_system = true
  const { data: newEmployeeWithIsSystem, error: insertErrorWithIsSystem } = await adminSupabase
    .from('employees')
    .insert({ ...baseInsert, is_system: true })
    .select('id')
    .single()

  if (!insertErrorWithIsSystem && newEmployeeWithIsSystem) {
    return newEmployeeWithIsSystem
  }

  // If is_system column doesn't exist, retry without it
  if (insertErrorWithIsSystem?.message?.includes('is_system')) {
    const { data: newEmployee, error: insertError } = await adminSupabase
      .from('employees')
      .insert(baseInsert)
      .select('id')
      .single()

    if (insertError) {
      console.error('[v0] Failed to create system viewer employee (fallback):', insertError)
      return null
    }

    return newEmployee
  }

  console.error('[v0] Failed to create system viewer employee:', insertErrorWithIsSystem)
  return null
}

/**
 * Ensure platform admin has a team_members row for the selected company.
 * This allows RLS policies to grant read access.
 * 
 * IMPORTANT: Before creating new access, we CLEAN UP any old viewer artifacts
 * for this platform admin to prevent stale/incorrect access across companies.
 * 
 * We link employee_id to a SYSTEM viewer employee (is_system=true, auth_user_id=null).
 * This avoids UNIQUE constraint violations on auth_user_id.
 */
async function ensurePlatformMembership(
  platformAdminUserId: string,
  companyId: string
): Promise<MembershipResult> {
  // STEP 1: Clean up old viewer artifacts from previous sessions
  // This prevents stale access to other companies
  await cleanupOldViewerArtifacts(platformAdminUserId)

  // STEP 2: Check if platform admin already has membership in this company
  // (Could be a real membership, not from view-as)
  const { data: existingMembership } = await adminSupabase
    .from('team_members')
    .select('id, employee_id')
    .eq('company_id', companyId)
    .eq('user_id', platformAdminUserId)
    .maybeSingle()

  if (existingMembership) {
    // Check if it's a viewer employee or a real membership
    if (existingMembership.employee_id) {
      const { data: empData } = await adminSupabase
        .from('employees')
        .select('full_name')
        .eq('id', existingMembership.employee_id)
        .maybeSingle()

      if (empData?.full_name?.startsWith(VIEWER_EMPLOYEE_NAME)) {
        // This is a viewer membership, return it
        return { 
          created: false, 
          companyId, 
          teamMemberId: existingMembership.id,
          systemEmployeeId: existingMembership.employee_id,
        }
      }
    }
    // It's a real membership, use it (no viewer employee created)
    return { created: false, companyId, teamMemberId: existingMembership.id }
  }

  // STEP 3: Get or create a system viewer employee for this company
  const systemEmployee = await getOrCreateSystemViewerEmployee(companyId)

  if (!systemEmployee) {
    return { 
      created: false, 
      companyId, 
      error: 'Ошибка создания временного доступа: не удалось создать системного сотрудника' 
    }
  }

  // STEP 4: Pick a valid role from the constraint
  // Always use 'employee' as it's the safest and most likely to be allowed
  const safeRole = await pickSafestRole()

  // STEP 5: Create team_members row
  const { data: newTeamMember, error: tmError } = await adminSupabase
    .from('team_members')
    .insert({
      company_id: companyId,
      user_id: platformAdminUserId,
      employee_id: systemEmployee.id,
      member_role: safeRole,
    })
    .select('id')
    .single()

  if (tmError || !newTeamMember) {
    console.error('[v0] Failed to create team_members row:', tmError)
    // Clean up the viewer employee we just created
    await adminSupabase.from('employees').delete().eq('id', systemEmployee.id)
    return { 
      created: false, 
      companyId, 
      error: `Ошибка создания временного доступа: ${tmError?.message || 'unknown'}` 
    }
  }

  return {
    created: true,
    companyId,
    teamMemberId: newTeamMember.id,
    systemEmployeeId: systemEmployee.id,
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
      readOnly: true,
      // Track membership for cleanup
      createdMembership: membershipResult.created,
      createdTeamMemberId: membershipResult.teamMemberId,
      createdViewerEmployeeId: membershipResult.systemEmployeeId,
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
 * Cleans up temporary team_members row and viewer employee if created.
 */
export async function endViewAsSession(): Promise<{ success: boolean }> {
  try {
    // Get current session to check if we need to clean up membership
    const session = await getViewAsSession()

    if (session?.createdMembership) {
      // Clean up the temporary team_members row first (FK constraint)
      if (session.createdTeamMemberId) {
        const { error: tmDeleteError } = await adminSupabase
          .from('team_members')
          .delete()
          .eq('id', session.createdTeamMemberId)

        if (tmDeleteError) {
          console.error('[v0] Failed to delete temp team_members:', tmDeleteError)
        }
      }

      // Clean up the viewer employee if created
      if (session.createdViewerEmployeeId) {
        const { error: empDeleteError } = await adminSupabase
          .from('employees')
          .delete()
          .eq('id', session.createdViewerEmployeeId)

        if (empDeleteError) {
          console.error('[v0] Failed to delete viewer employee:', empDeleteError)
        }
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
