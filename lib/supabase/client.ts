import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseEnv } from './env'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Singleton browser Supabase client.
 * Uses getPublicSupabaseEnv() for clear error messages if env vars are missing.
 * Only one instance is ever created per browser tab.
 */
export function createClient() {
  if (browserClient) return browserClient

  const { url, anonKey } = getPublicSupabaseEnv()

  browserClient = createBrowserClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          credentials: 'omit',
          mode: 'cors',
        })
      },
    },
  })
  return browserClient
}

// Alias for backwards compatibility
export const createClientComponentClient = createClient
