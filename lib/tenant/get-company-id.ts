import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves the active company_id for the given authenticated user.
 * Looks up the first team_members row for that user.
 *
 * @throws Error with code `no_company` if the user has no company membership.
 */
export async function getCompanyId(supabase: SupabaseClient, userId: string): Promise<string> {
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
