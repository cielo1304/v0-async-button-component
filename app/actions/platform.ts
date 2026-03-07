'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { adminSupabase } from '@/lib/supabase/admin'
import { 
  createViewAsSession, 
  setViewAsCookie, 
  clearViewAsCookie, 
  getViewAsSession,
  getLockedCompanyScope,
  type ViewAsSession 
} from '@/lib/view-as'

/**
 * Get the effective company name for display.
 * 
 * HARD SCOPE LOCK: In View-As mode, returns ONLY the impersonated company name,
 * NOT the operator's real company. This prevents A+B scope confusion in UI.
 */
export async function getEffectiveCompanyName(): Promise<{
  companyName: string | null
  isImpersonation: boolean
}> {
  try {
    // Check for View-As scope lock first
    const session = await getViewAsSession()
    if (session?.companyName) {
      return {
        companyName: session.companyName,
        isImpersonation: true,
      }
    }

    // Normal mode: look up company via team_members
    const { supabase, user } = await createSupabaseAndRequireUser()

    const { data: member } = await supabase
      .from('team_members')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!member?.company_id) {
      return { companyName: null, isImpersonation: false }
    }

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', member.company_id)
      .maybeSingle()

    return {
      companyName: company?.name ?? null,
      isImpersonation: false,
    }
  } catch {
    return { companyName: null, isImpersonation: false }
  }
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
 * List ALL employees of a company for view-as dropdown.
 * 
 * Requirements:
 * - Returns employees where company_id == companyId (does NOT require auth_user_id)
 * - Excludes viewer/system employees using SAFE fallback logic:
 *   - is_system == true (if column exists and is true)
 *   - full_name starts with 'Просмотр (админ платформы)' (always checked as fallback)
 * - Returns minimal fields: id, full_name, email, member_role (for "Владелец" label)
 * 
 * ROBUSTNESS: This function MUST NOT crash if is_system column is missing.
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
    // Query ALL active employees (not just those with auth_user_id)
    // NOTE: We select is_system but handle gracefully if it doesn't exist
    const { data: employeesData, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name, position, is_active, email, auth_user_id, is_system')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name')

    if (empError) {
      // Check if error is due to missing is_system column - retry without it
      if (empError.message?.includes('is_system') || empError.code === '42703') {
        console.warn('[listCompanyEmployees] is_system column missing, retrying without it')
        const { data: fallbackData, error: fallbackError } = await adminSupabase
          .from('employees')
          .select('id, full_name, position, is_active, email, auth_user_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('full_name')

        if (fallbackError) {
          console.error('[listCompanyEmployees] fallback query error:', fallbackError)
          return { ok: false, error: `Ошибка загрузки сотрудников: ${fallbackError.message}` }
        }

        // Mark all as having no is_system info
        const dataWithoutIsSystem = (fallbackData || []).map(emp => ({ ...emp, is_system: undefined }))
        return processEmployeeData(dataWithoutIsSystem, companyId)
      }

      console.error('[listCompanyEmployees] employees error:', empError)
      return { ok: false, error: `Ошибка загрузки сотрудников: ${empError.message}` }
    }

    return processEmployeeData(employeesData || [], companyId)
  } catch (err) {
    console.error('[listCompanyEmployees] error:', err)
    return { ok: false, error: 'Ошибка загрузки списка сотрудников' }
  }
}

/**
 * Helper: Process employee data and apply filtering.
 * Separated for reuse in fallback path.
 */
async function processEmployeeData(
  employeesData: Array<{
    id: string
    full_name: string
    position: string | null
    is_active: boolean
    email: string | null
    auth_user_id: string | null
    is_system?: boolean | null | undefined
  }>,
  companyId: string
): Promise<{ ok: boolean; employees?: EmployeeWithUser[]; error?: string }> {
  if (employeesData.length === 0) {
    return { ok: true, employees: [] }
  }

  // Get team_members to find role info (for "Владелец" label)
  const { data: teamMembersData, error: tmError } = await adminSupabase
    .from('team_members')
    .select('employee_id, user_id, member_role')
    .eq('company_id', companyId)

  if (tmError) {
    console.error('[listCompanyEmployees] team_members error:', tmError)
    // Non-fatal, continue without role info
  }

  // Create a map of employee_id -> { user_id, member_role }
  const teamMemberMap = new Map<string, { user_id: string | null; member_role: string | null }>()
  for (const tm of teamMembersData || []) {
    if (tm.employee_id) {
      teamMemberMap.set(tm.employee_id, { user_id: tm.user_id, member_role: tm.member_role })
    }
  }

  // Filter out viewer/system employees and map to EmployeeWithUser
  // ROBUST: Works even if is_system column is missing (uses name-based fallback)
  const employees: EmployeeWithUser[] = employeesData
    .filter((emp) => {
      // Exclude if is_system == true (safe check for undefined/null)
      if (emp.is_system === true) return false
      // Exclude if full_name starts with viewer employee prefix (ALWAYS checked as fallback)
      if (emp.full_name?.startsWith(VIEWER_EMPLOYEE_NAME)) return false
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
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CLEANUP FUNCTIONS (for backward compatibility only)
// These handle cleanup of old temporary membership artifacts from previous sessions
// New sessions do NOT create these artifacts - they use pure impersonation
// ─────────────────────────────────────────────────────────────────────────────

// Legacy viewer employee name prefix (for cleanup of old artifacts)
const VIEWER_EMPLOYEE_NAME = 'Просмотр (админ платформы)'

/**
 * LEGACY CLEANUP: Clean up old viewer artifacts from previous view-as sessions.
 * 
 * This function is called:
 * 1. When ending a view-as session (to clean up any legacy artifacts in the session)
 * 2. When starting a new session (to ensure no stale artifacts exist)
 * 
 * New sessions do NOT create these artifacts - this is for migration/compatibility only.
 */
async function cleanupLegacyViewerArtifacts(session: ViewAsSession | null): Promise<void> {
  try {
    // If session has legacy cleanup fields, clean them up
    if (session?.createdMembership) {
      // Clean up the temporary team_members row first (FK constraint)
      if (session.createdTeamMemberId) {
        await adminSupabase
          .from('team_members')
          .delete()
          .eq('id', session.createdTeamMemberId)
      }

      // Clean up the viewer employee if created
      if (session.createdViewerEmployeeId) {
        await adminSupabase
          .from('employees')
          .delete()
          .eq('id', session.createdViewerEmployeeId)
      }
    }

    // Also clean up any stale viewer artifacts for this user (belt and suspenders)
    if (session?.realActorUserId) {
      const { data: teamMembers } = await adminSupabase
        .from('team_members')
        .select('id, employee_id')
        .eq('user_id', session.realActorUserId)

      for (const tm of teamMembers || []) {
        if (!tm.employee_id) continue

        const { data: employee } = await adminSupabase
          .from('employees')
          .select('id, full_name')
          .eq('id', tm.employee_id)
          .maybeSingle()

        if (employee?.full_name?.startsWith(VIEWER_EMPLOYEE_NAME)) {
          await adminSupabase.from('team_members').delete().eq('id', tm.id)
          await adminSupabase.from('employees').delete().eq('id', employee.id)
        }
      }
    }
  } catch (err) {
    console.error('[v0] cleanupLegacyViewerArtifacts error:', err)
    // Non-fatal, continue
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW-AS SESSION MANAGEMENT (Auth-Based Impersonation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a view-as session (platform admin only)
 * 
 * NEW DESIGN: Pure auth-based impersonation
 * - NO temporary membership artifacts are created
 * - Session contains all info needed for authorization resolution
 * - Authorization uses service-role queries in impersonation mode
 * - Real actor and effective actor are both preserved for audit
 */
export async function startViewAsSession(
  companyId: string,
  employeeId: string
): Promise<{ success: boolean; error?: string; errorCode?: 'not_platform_admin' | 'no_company' | 'no_employee' | 'unknown' }> {
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    // STEP 1: Verify platform admin status
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    if (adminError || !isAdmin) {
      return { success: false, error: 'Недостаточно прав', errorCode: 'not_platform_admin' }
    }

    // STEP 2: Get company info (using service role to bypass RLS)
    const { data: company, error: companyError } = await adminSupabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Компания не найдена', errorCode: 'no_company' }
    }

    // STEP 3: Get employee info (using service role to bypass RLS)
    const { data: employee, error: empError } = await adminSupabase
      .from('employees')
      .select('id, full_name')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .single()

    if (empError || !employee) {
      return { success: false, error: 'Сотрудник не найден', errorCode: 'no_employee' }
    }

    // STEP 4: Clean up any legacy artifacts before starting new session
    const existingSession = await getViewAsSession()
    if (existingSession) {
      await cleanupLegacyViewerArtifacts(existingSession)
    }

    // STEP 5: Create the impersonation session token
    // NO temporary membership artifacts are created
    const token = await createViewAsSession({
      realActorUserId: user.id,
      effectiveCompanyId: companyId,
      effectiveEmployeeId: employeeId,
      effectiveDisplayName: employee.full_name,
      companyName: company.name,
    })

    // STEP 6: Set the cookie
    await setViewAsCookie(token)

    return { success: true }
  } catch (err) {
    console.error('[v0] startViewAsSession error:', err)
    return { success: false, error: 'Ошибка запуска режима просмотра', errorCode: 'unknown' }
  }
}

/**
 * End the current view-as session
 * 
 * NEW DESIGN: Pure session-based
 * - Clears the impersonation cookie
 * - Cleans up any legacy artifacts if present (for backward compatibility)
 * - No artifacts are created in new sessions, so usually nothing to clean up
 */
export async function endViewAsSession(): Promise<{ success: boolean }> {
  try {
    // Get current session to check if we need to clean up legacy artifacts
    const session = await getViewAsSession()

    // Clean up any legacy artifacts from old-style sessions
    if (session) {
      await cleanupLegacyViewerArtifacts(session)
    }

    // Clear the impersonation cookie
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

/**
 * Get the user mode context for routing/display decisions.
 * 
 * This determines what UI experience the user should see:
 * - platform_admin_only: Only platform admin UI (no tenant modules)
 * - view_as_readonly: Tenant UI as impersonated user (read-only)
 * - tenant_user: Standard tenant user experience
 */
export async function getUserModeContext(): Promise<{
  mode: 'platform_admin_only' | 'view_as_readonly' | 'tenant_user'
  isPlatformAdmin: boolean
  isViewAs: boolean
  hasTeamMembership: boolean
  companyId: string | null
  companyName: string | null
  effectiveEmployeeId: string | null
  effectiveEmployeeName: string | null
}> {
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    // Check View-As session first
    const viewAsSession = await getViewAsSession()
    const isViewAs = viewAsSession !== null

    // Check platform admin status
    const { data: isAdmin } = await supabase.rpc('is_platform_admin')
    const isPlatformAdmin = !!isAdmin

    // If in View-As mode, return view_as_readonly context
    if (isViewAs && viewAsSession) {
      return {
        mode: 'view_as_readonly',
        isPlatformAdmin,
        isViewAs: true,
        hasTeamMembership: true, // Synthetic - acting as an employee
        companyId: viewAsSession.effectiveCompanyId,
        companyName: viewAsSession.companyName,
        effectiveEmployeeId: viewAsSession.effectiveEmployeeId,
        effectiveEmployeeName: viewAsSession.effectiveDisplayName,
      }
    }

    // Check for real team membership
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('company_id, employee_id, companies(name), employees(full_name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const hasTeamMembership = !!teamMember?.company_id

    // If platform admin without team membership and not in View-As: platform-only mode
    if (isPlatformAdmin && !hasTeamMembership) {
      return {
        mode: 'platform_admin_only',
        isPlatformAdmin: true,
        isViewAs: false,
        hasTeamMembership: false,
        companyId: null,
        companyName: null,
        effectiveEmployeeId: null,
        effectiveEmployeeName: null,
      }
    }

    // Normal tenant user mode
    const companyName = teamMember?.companies && !Array.isArray(teamMember.companies)
      ? (teamMember.companies as { name: string }).name
      : null
    const employeeName = teamMember?.employees && !Array.isArray(teamMember.employees)
      ? (teamMember.employees as { full_name: string }).full_name
      : null

    return {
      mode: 'tenant_user',
      isPlatformAdmin,
      isViewAs: false,
      hasTeamMembership,
      companyId: teamMember?.company_id ?? null,
      companyName,
      effectiveEmployeeId: teamMember?.employee_id ?? null,
      effectiveEmployeeName: employeeName,
    }
  } catch {
    // Default to tenant user if something fails
    return {
      mode: 'tenant_user',
      isPlatformAdmin: false,
      isViewAs: false,
      hasTeamMembership: false,
      companyId: null,
      companyName: null,
      effectiveEmployeeId: null,
      effectiveEmployeeName: null,
    }
  }
}
