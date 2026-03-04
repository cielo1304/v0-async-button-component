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
 * List ALL employees of a company (platform admin only)
 * For view-as, we list all employees regardless of whether they have linked auth users.
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
    // Query employees WITHOUT is_platform_viewer first (column may not exist if migration not applied)
    // We'll filter out platform viewer employees by checking the column if it exists
    const { data: employeesData, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name, position, is_active, email, auth_user_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name')

    if (empError) {
      console.error('[v0] listCompanyEmployees employees error:', empError)
      return { ok: false, error: `Ошибка загрузки сотрудников: ${empError.message}` }
    }

    if (!employeesData || employeesData.length === 0) {
      return { ok: true, employees: [] }
    }

    // Get team_members to find role info and user_id
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

    // Filter out platform viewer employees:
    // - By member_role = 'platform_viewer' in team_members
    // - By name pattern 'Просмотр (админ платформы)' (for when is_platform_viewer column doesn't exist)
    const employees: EmployeeWithUser[] = employeesData
      .filter((emp) => {
        const tm = teamMemberMap.get(emp.id)
        // Exclude employees with platform_viewer role
        if (tm?.member_role === 'platform_viewer') return false
        // Also exclude by name pattern (fallback when column doesn't exist)
        if (emp.full_name === 'Просмотр (админ платформы)') return false
        return true
      })
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
  viewerEmployeeId?: string
  teamMemberId?: string
  error?: string
}

/**
 * Ensure platform admin has a temporary team_members row for the selected company.
 * This allows RLS policies to grant read access.
 * 
 * If membership already exists (platform admin is already a member of the company),
 * we don't create anything and return { created: false }.
 * 
 * IMPORTANT: We use member_role='employee' (an allowed value) instead of 'platform_viewer'
 * to avoid CHECK constraint violations. The view-as mode is tracked via cookies, not DB role.
 */
async function ensurePlatformViewerMembership(
  platformAdminUserId: string,
  platformAdminEmail: string,
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
    return { created: false, companyId }
  }

  // Check if we already have a platform viewer employee for this admin in this company
  // Try with is_platform_viewer first, fallback without if column doesn't exist
  let existingViewerEmployee: { id: string } | null = null
  
  // First try with is_platform_viewer column
  const { data: viewerWithFlag, error: viewerFlagError } = await adminSupabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('auth_user_id', platformAdminUserId)
    .eq('is_platform_viewer', true)
    .maybeSingle()

  if (!viewerFlagError && viewerWithFlag) {
    existingViewerEmployee = viewerWithFlag
  } else if (viewerFlagError?.message?.includes('is_platform_viewer')) {
    // Column doesn't exist - try finding by email pattern instead
    const { data: viewerByEmail } = await adminSupabase
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('auth_user_id', platformAdminUserId)
      .ilike('full_name', '%Просмотр (админ платформы)%')
      .maybeSingle()
    
    existingViewerEmployee = viewerByEmail
  }

  let viewerEmployeeId: string

  if (existingViewerEmployee) {
    // Reuse existing viewer employee
    viewerEmployeeId = existingViewerEmployee.id
  } else {
    // Create a new platform viewer employee
    // Try with is_platform_viewer column first, fallback without if column doesn't exist
    let newEmployee: { id: string } | null = null
    let empError: Error | null = null

    const employeeData = {
      company_id: companyId,
      full_name: 'Просмотр (админ платформы)',
      email: platformAdminEmail,
      auth_user_id: platformAdminUserId,
      is_active: true,
      is_platform_viewer: true,
    }

    const { data: empWithFlag, error: flagError } = await adminSupabase
      .from('employees')
      .insert(employeeData)
      .select('id')
      .single()

    if (flagError?.message?.includes('is_platform_viewer')) {
      // Column doesn't exist - insert without it
      const { data: empNoFlag, error: noFlagError } = await adminSupabase
        .from('employees')
        .insert({
          company_id: companyId,
          full_name: 'Просмотр (админ платформы)',
          email: platformAdminEmail,
          auth_user_id: platformAdminUserId,
          is_active: true,
        })
        .select('id')
        .single()
      
      newEmployee = empNoFlag
      empError = noFlagError as Error | null
    } else {
      newEmployee = empWithFlag
      empError = flagError as Error | null
    }

    if (empError || !newEmployee) {
      console.error('[v0] Failed to create viewer employee:', empError)
      return { created: false, companyId, error: 'Ошибка создания временного сотрудника' }
    }

    viewerEmployeeId = newEmployee.id
  }

  // Create team_members row with 'employee' role (NOT 'platform_viewer' - that violates CHECK constraint)
  // The view-as mode is tracked via cookies, not via member_role
  const { data: newTeamMember, error: tmError } = await adminSupabase
    .from('team_members')
    .insert({
      company_id: companyId,
      user_id: platformAdminUserId,
      employee_id: viewerEmployeeId,
      member_role: 'employee', // Use allowed role value, view-as tracked via cookie
    })
    .select('id')
    .single()

  if (tmError || !newTeamMember) {
    console.error('[v0] Failed to create team_members row:', tmError)
    return { created: false, companyId, error: 'Ошибка создания членства' }
  }

  return {
    created: true,
    companyId,
    viewerEmployeeId,
    teamMemberId: newTeamMember.id,
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
    const membershipResult = await ensurePlatformViewerMembership(
      user.id,
      user.email || 'platform-admin@mutka.local',
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
      createdViewerEmployeeId: membershipResult.viewerEmployeeId,
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
 * Cleans up temporary membership if it was created.
 */
export async function endViewAsSession(): Promise<{ success: boolean }> {
  try {
    // Get current session to check if we need to clean up membership
    const session = await getViewAsSession()

    if (session?.createdMembership) {
      // Clean up the temporary team_members row
      if (session.createdTeamMemberId) {
        const { error: tmDeleteError } = await adminSupabase
          .from('team_members')
          .delete()
          .eq('id', session.createdTeamMemberId)

        if (tmDeleteError) {
          console.error('[v0] Failed to delete temp team_members:', tmDeleteError)
        }
      }

      // Clean up the temporary viewer employee
      // Try with is_platform_viewer filter first, then fallback by name pattern
      if (session.createdViewerEmployeeId) {
        // First try with is_platform_viewer = true (safer)
        const { error: empDeleteError } = await adminSupabase
          .from('employees')
          .delete()
          .eq('id', session.createdViewerEmployeeId)
          .eq('is_platform_viewer', true)

        if (empDeleteError?.message?.includes('is_platform_viewer')) {
          // Column doesn't exist - delete by ID + name pattern match for safety
          const { error: fallbackError } = await adminSupabase
            .from('employees')
            .delete()
            .eq('id', session.createdViewerEmployeeId)
            .eq('full_name', 'Просмотр (админ платформы)')

          if (fallbackError) {
            console.error('[v0] Failed to delete temp viewer employee (fallback):', fallbackError)
          }
        } else if (empDeleteError) {
          console.error('[v0] Failed to delete temp viewer employee:', empDeleteError)
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
