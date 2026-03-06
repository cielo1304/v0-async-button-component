import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if an employee is a system/viewer employee that should be hidden from UI.
 * Uses both name prefix check and is_system flag for maximum compatibility.
 */
export function isSystemEmployee(employee: { full_name?: string | null; is_system?: boolean | null }): boolean {
  // Check name prefix (always works, even if is_system column doesn't exist)
  if (employee.full_name?.startsWith('Просмотр (админ платформы)')) {
    return true
  }
  // Check is_system flag (if available)
  if (employee.is_system === true) {
    return true
  }
  return false
}

/**
 * Filter out system/viewer employees from a list.
 * Use this as a UI-level safety net in addition to query-level filtering.
 */
export function filterOutSystemEmployees<T extends { full_name?: string | null; is_system?: boolean | null }>(
  employees: T[]
): T[] {
  return employees.filter(emp => !isSystemEmployee(emp))
}
