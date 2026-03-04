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
 * List employees of a company who have linked auth users (platform admin only)
 * Uses service role to bypass RLS since platform admin is not a team member.
 */
export async function listCompanyEmployees(companyId: string): Promise<{ employees?: EmployeeWithUser[]; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError || !isAdmin) {
      return { error: 'Недостаточно прав' }
    }

    // Use admin client to bypass RLS
    // First get all employees for this company
    const { data: employeesData, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name, position, is_active')
      .eq('company_id', companyId)
      .order('full_name')

    if (empError) {
      console.error('[v0] listCompanyEmployees employees error:', empError)
      return { error: empError.message }
    }

    if (!employeesData || employeesData.length === 0) {
      return { employees: [] }
    }

    // Get team_members to find which employees have linked user_id
    const { data: teamMembersData, error: tmError } = await adminSupabase
      .from('team_members')
      .select('employee_id, user_id, member_role')
      .eq('company_id', companyId)
      .not('user_id', 'is', null)

    if (tmError) {
      console.error('[v0] listCompanyEmployees team_members error:', tmError)
      return { error: tmError.message }
    }

    // Create a map of employee_id -> { user_id, member_role }
    const teamMemberMap = new Map<string, { user_id: string; member_role: string | null }>()
    for (const tm of teamMembersData || []) {
      if (tm.employee_id && tm.user_id) {
        teamMemberMap.set(tm.employee_id, { user_id: tm.user_id, member_role: tm.member_role })
      }
    }

    // Filter employees who have a linked user_id
    const employees: EmployeeWithUser[] = employeesData
      .filter((emp) => teamMemberMap.has(emp.id))
      .map((emp) => {
        const tm = teamMemberMap.get(emp.id)!
        return {
          id: emp.id,
          full_name: emp.full_name,
          position: emp.position,
          user_id: tm.user_id,
          member_role: tm.member_role ?? undefined,
        }
      })

    return { employees }
  } catch (err) {
    console.error('[v0] listCompanyEmployees error:', err)
    return { error: 'Failed to list employees' }
  }
}

/**
 * Start a view-as session (platform admin only)
 * Returns typed error codes for better UI handling.
 */
export async function startViewAsSession(
  companyId: string,
  employeeId: string
): Promise<{ success: boolean; error?: string; errorCode?: 'not_platform_admin' | 'no_company' | 'no_employee' | 'no_linked_user' | 'unknown' }> {
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

    // Get employee info directly from employees table
    const { data: employee, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name, auth_user_id')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .single()

    if (empError || !employee) {
      return { success: false, error: 'Сотрудник не найден', errorCode: 'no_employee' }
    }

    // Try to get user_id from team_members first (preferred)
    let targetUserId: string | null = null

    const { data: teamMember } = await adminSupabase
      .from('team_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .not('user_id', 'is', null)
      .single()

    if (teamMember?.user_id) {
      targetUserId = teamMember.user_id
    } else if (employee.auth_user_id) {
      // Fallback to employees.auth_user_id
      targetUserId = employee.auth_user_id
    }

    if (!targetUserId) {
      return { 
        success: false, 
        error: 'У сотрудника нет привязанного пользователя (auth).', 
        errorCode: 'no_linked_user' 
      }
    }

    // Create the view-as session token
    const token = await createViewAsSession({
      targetUserId,
      targetCompanyId: companyId,
      targetEmployeeId: employeeId,
      targetDisplayName: employee.full_name,
      companyName: company.name,
      viewerAdminUserId: user.id,
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
 */
export async function endViewAsSession(): Promise<{ success: boolean }> {
  try {
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
