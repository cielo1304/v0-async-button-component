import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { getViewAsSession, getLockedCompanyScope } from '@/lib/view-as'

/**
 * Verify that the current request has an authenticated user.
 * Accepts an already-created server client to avoid creating duplicates.
 * 
 * @param supabase - An existing Supabase server client
 * @returns The authenticated user
 * @throws Error('Unauthorized') if no session
 */
export async function requireUser(supabase: SupabaseClient): Promise<User> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new Error('Unauthorized')
  }
  return data.user
}

/**
 * Convenience helper: creates a server client AND verifies auth in one call.
 * Use this when you need both the client and the user.
 * Only ONE server client is created per call.
 */
export async function createSupabaseAndRequireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  return { supabase, user }
}

/**
 * CANONICAL TENANT DATA ACCESS HELPER
 * 
 * This is the SINGLE SOURCE OF TRUTH for company-scoped data access.
 * Use this helper in ALL server actions that fetch or mutate tenant data.
 * 
 * In View-As mode:
 * - Returns adminSupabase (service-role client that bypasses RLS)
 * - Returns the locked companyId from the View-As session
 * 
 * In normal mode:
 * - Returns the user's authenticated supabase client (respects RLS)
 * - Returns the companyId from team_members lookup
 * 
 * IMPORTANT: Always filter your queries by the returned companyId!
 * Even with adminSupabase in View-As mode, you must explicitly filter
 * by companyId to prevent cross-company data access.
 * 
 * @throws Error('Unauthorized') if no session
 * @throws Error('no_company') if user has no company membership
 */
export async function createTenantSupabase(): Promise<{
  supabase: SupabaseClient
  user: User
  companyId: string
  isViewAs: boolean
}> {
  // Create user client and verify auth
  const userSupabase = await createClient()
  const user = await requireUser(userSupabase)
  
  // Check for View-As mode
  const viewAsSession = await getViewAsSession()
  const lockedScope = await getLockedCompanyScope()
  
  if (viewAsSession && lockedScope) {
    // View-As mode: use admin client to bypass RLS
    // The caller MUST filter by companyId
    return {
      supabase: adminSupabase,
      user,
      companyId: lockedScope,
      isViewAs: true,
    }
  }
  
  // Normal mode: look up company via team_members
  const { data, error } = await userSupabase
    .from('team_members')
    .select('company_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (error || !data?.company_id) {
    const err = new Error('Вы не состоите в компании') as Error & { code: string }
    err.code = 'no_company'
    throw err
  }

  return {
    supabase: userSupabase,
    user,
    companyId: data.company_id,
    isViewAs: false,
  }
}
