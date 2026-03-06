import type { SupabaseClient } from '@supabase/supabase-js'
import { getViewAsSession } from '@/lib/view-as'
import { adminSupabase } from '@/lib/supabase/admin'

/**
 * Resolves the "acting" employee_id for permission checks and UI context.
 * 
 * In impersonation mode (View-As), returns the effective employee from the session.
 * The session contains all authorization info - no temporary membership artifacts needed.
 * 
 * In normal mode, looks up the employee by auth_user_id.
 *
 * @returns employee_id or null if not found
 */
export async function getActingEmployeeId(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<string | null> {
  // Check for impersonation mode first
  const viewAsSession = await getViewAsSession()
  if (viewAsSession?.effectiveEmployeeId && viewAsSession.effectiveCompanyId === companyId) {
    // In impersonation mode, use the effective employee from session
    // No DB lookup needed - session contains all authorization info
    return viewAsSession.effectiveEmployeeId
  }

  // Normal mode: look up employee by auth_user_id
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('auth_user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[v0] getActingEmployeeId error:', error)
    return null
  }

  return data?.id ?? null
}

/**
 * Get full employee info for the "acting" employee.
 * 
 * In impersonation mode, uses service-role to fetch employee info
 * (since the platform admin doesn't have RLS access to the target company).
 * 
 * In normal mode, uses the user's supabase client.
 */
export async function getActingEmployee(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<{ id: string; full_name: string; position: string | null } | null> {
  const viewAsSession = await getViewAsSession()
  const employeeId = await getActingEmployeeId(supabase, userId, companyId)
  if (!employeeId) return null

  // In impersonation mode, use service-role to bypass RLS
  const client = viewAsSession ? adminSupabase : supabase

  const { data, error } = await client
    .from('employees')
    .select('id, full_name, position')
    .eq('id', employeeId)
    .single()

  if (error) {
    console.error('[v0] getActingEmployee error:', error)
    return null
  }

  return data
}
