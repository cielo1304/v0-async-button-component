/**
 * Validate and return public Supabase environment variables.
 * These are embedded at build time by Next.js for client-side usage.
 * 
 * Throws a clear error if they are missing, instead of a cryptic "Failed to fetch".
 */
export function getPublicSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL. ' +
      'Set it in Vercel project settings (or .env.local for local dev) and redeploy.'
    )
  }

  if (!anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set it in Vercel project settings (or .env.local for local dev) and redeploy.'
    )
  }

  return { url, anonKey }
}

/**
 * Check if Supabase env vars are available without throwing.
 * Useful for UI components that want to show an alert instead of crashing.
 */
export function hasSupabaseEnv(): { ok: true } | { ok: false; error: string } {
  try {
    getPublicSupabaseEnv()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown env error' }
  }
}
