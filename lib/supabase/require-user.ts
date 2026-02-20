import { createClient } from '@/lib/supabase/server'

/**
 * Require authenticated user in server actions / route handlers.
 * Throws if no user session exists.
 */
export async function requireUser() {
  const supabase = await createClient()

  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    user = data.user
  } catch {
    throw new Error('Unauthorized')
  }

  if (!user) {
    throw new Error('Unauthorized')
  }

  return { supabase, user }
}
