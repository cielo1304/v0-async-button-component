import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

// Get environment variables - these are embedded at build time in Next.js
const getEnvVar = (key: string): string | undefined => {
  if (typeof window !== 'undefined') {
    // In browser, check window object first (for v0 runtime)
    const windowEnv = (window as any).__ENV__
    if (windowEnv && windowEnv[key]) {
      return windowEnv[key]
    }
  }
  
  // Fallback to process.env (standard Next.js)
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key]
  }
  
  return undefined
}

export function createClient() {
  if (browserClient) return browserClient
  
  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  
  console.log('[v0] Supabase client init', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'missing'
  })
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[v0] Missing Supabase environment variables')
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
  }
  
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: (url, options = {}) => {
        console.log('[v0] Supabase fetch:', url)
        return fetch(url, {
          ...options,
          // Add credentials and mode to help with CORS in preview environment
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
