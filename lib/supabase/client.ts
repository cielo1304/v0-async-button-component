import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (browserClient) return browserClient
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[v0] Missing Supabase environment variables', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      env: typeof process !== 'undefined' ? Object.keys(process.env).filter(k => k.includes('SUPABASE')) : []
    })
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
  }
  
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return browserClient
}

// Alias for backwards compatibility
export const createClientComponentClient = createClient
