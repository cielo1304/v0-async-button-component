import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

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
