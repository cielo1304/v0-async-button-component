import type { SupabaseClient } from '@supabase/supabase-js'
import { getViewAsSession } from '@/lib/view-as'

/**
 * Resolves the active company_id for the given authenticated user.
 * 
 * In impersonation mode (View-As), returns the effective company from the session.
 * The session contains all authorization info - no temporary membership artifacts needed.
 * 
 * In normal mode, looks up the first team_members row for that user.
 *
 * @throws Error with code `no_company` if the user has no company membership.
 */
export async function getCompanyId(supabase: SupabaseClient, userId: string): Promise<string> {
  // Check for impersonation mode first
  const viewAsSession = await getViewAsSession()
  if (viewAsSession?.effectiveCompanyId) {
    // In impersonation mode, use the effective company from session
    // No DB lookup needed - session contains all authorization info
    return viewAsSession.effectiveCompanyId
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
