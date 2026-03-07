/**
 * Safe Employee Filtering Utilities
 * 
 * Provides robust filtering of system/viewer employees that works even
 * when the `is_system` column is missing from the database schema.
 * 
 * ROBUSTNESS GUARANTEE:
 * - Code MUST NOT crash if is_system column is absent
 * - Uses name-based fallback for viewer employees
 * - Safe handling of undefined/null values
 */

// Viewer employee name prefix (system employees created for View-As)
export const VIEWER_EMPLOYEE_NAME_PREFIX = 'Просмотр (админ платформы)'

/**
 * Check if an employee is a system/viewer employee.
 * 
 * ROBUST: Works even if is_system column is missing.
 * Uses both is_system flag AND name-based detection as fallback.
 * 
 * @param employee - Employee object with optional is_system and full_name fields
 * @returns true if employee should be excluded from user-facing lists
 */
export function isSystemEmployee(employee: {
  is_system?: boolean | null | undefined
  full_name?: string | null
}): boolean {
  // Check is_system flag (safe for undefined/null)
  if (employee.is_system === true) {
    return true
  }
  
  // ALWAYS check name-based fallback (catches old viewer employees without is_system flag)
  if (employee.full_name?.startsWith(VIEWER_EMPLOYEE_NAME_PREFIX)) {
    return true
  }
  
  return false
}

/**
 * Filter out system/viewer employees from a list.
 * 
 * ROBUST: Works even if is_system column is missing in database.
 * 
 * @param employees - Array of employees to filter
 * @returns Array with system employees removed
 */
export function filterOutSystemEmployees<T extends {
  is_system?: boolean | null | undefined
  full_name?: string | null
}>(employees: T[]): T[] {
  return employees.filter(emp => !isSystemEmployee(emp))
}

/**
 * Build Supabase query filters for excluding system employees.
 * 
 * NOTE: This returns filters but the caller should handle the is_system
 * column gracefully in case of errors. For maximum robustness,
 * use filterOutSystemEmployees() on the result instead.
 * 
 * @param queryBuilder - Supabase query builder
 * @returns Query builder with is_system filter applied
 */
export function applySystemEmployeeFilter<T>(
  queryBuilder: T & { eq: (column: string, value: boolean) => T }
): T {
  // Only filter by is_system - the caller should also apply name-based
  // filtering on results for maximum robustness
  return queryBuilder.eq('is_system', false)
}
