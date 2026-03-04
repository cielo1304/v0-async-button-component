import type { SupabaseClient } from '@supabase/supabase-js'
import { getViewAsSession } from '@/lib/view-as'

/**
 * Resolves the "acting" employee_id for permission checks and UI context.
 * 
 * In view-as mode, returns the target employee from the view-as session
 * (the employee we are "viewing as").
 * 
 * Otherwise, looks up the employee by auth_user_id.
 *
 * @returns employee_id or null if not found
 */
export async function getActingEmployeeId(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<string | null> {
  // Check for view-as mode first
  const viewAsSession = await getViewAsSession()
  if (viewAsSession?.targetEmployeeId && viewAsSession.targetCompanyId === companyId) {
    // In view-as mode, use the target employee we are "acting as"
    return viewAsSession.targetEmployeeId
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
 * Used for displaying who we are viewing as in the UI.
 */
export async function getActingEmployee(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<{ id: string; full_name: string; position: string | null } | null> {
  const employeeId = await getActingEmployeeId(supabase, userId, companyId)
  if (!employeeId) return null

  const { data, error } = await supabase
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
