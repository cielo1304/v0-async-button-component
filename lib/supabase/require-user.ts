import { createClient } from '@/lib/supabase/server'

/**
 * Require authenticated user in server actions / route handlers.
 * Throws if no user session exists.
 */
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return { supabase, user }
}
