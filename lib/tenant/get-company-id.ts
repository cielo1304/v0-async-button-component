import type { SupabaseClient } from '@supabase/supabase-js'
import { getLockedCompanyScope } from '@/lib/view-as'

/**
 * Resolves the active company_id for the given authenticated user.
 * 
 * HARD SCOPE LOCK:
 * In impersonation mode (View-As), returns ONLY the effectiveCompanyId from the session.
 * This is the SINGLE SOURCE OF TRUTH - no fallback, no merging, no A+B.
 * 
 * In normal mode, looks up the first team_members row for that user.
 *
 * @throws Error with code `no_company` if the user has no company membership.
 */
export async function getCompanyId(supabase: SupabaseClient, userId: string): Promise<string> {
  // HARD SCOPE LOCK: In impersonation mode, return ONLY the locked company
  // No DB lookup, no fallback, no merging with operator's company
  const lockedScope = await getLockedCompanyScope()
  if (lockedScope) {
    return lockedScope
  }

  // Normal mode: look up company via team_members
  const { data, error } = await supabase
    .from('team_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (error || !data?.company_id) {
    const err = new Error('Вы не состоите в компании') as Error & { code: string }
    err.code = 'no_company'
    throw err
  }

  return data.company_id
}
