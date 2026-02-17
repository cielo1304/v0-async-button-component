'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/require-user'

const PLATFORM_ADMIN_EMAIL = 'cielo1304@gmail.com'

/**
 * Check if the current user is a platform admin
 */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { user } = await requireUser()
    return user.email === PLATFORM_ADMIN_EMAIL
  } catch {
    return false
  }
}

/**
 * Create a company invite (platform admin only)
 */
export async function createCompanyInvite(
  email: string,
  companyName: string
): Promise<{ token?: string; error?: string }> {
  try {
    const isAdmin = await isPlatformAdmin()
    if (!isAdmin) {
      return { error: 'Unauthorized: Only platform admin can create invites' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('create_company_invite', {
      p_email: email,
      p_company_name: companyName,
    })

    if (error) {
      console.error('[v0] create_company_invite RPC error:', error)
      return { error: error.message }
    }

    return { token: data as string }
  } catch (err) {
    console.error('[v0] createCompanyInvite error:', err)
    return { error: 'Failed to create invite' }
  }
}

/**
 * List all company invites (platform admin only)
 */
export async function listCompanyInvites(): Promise<{
  invites?: Array<{
    id: string
    email: string
    company_name: string
    token: string
    expires_at: string
    used_at: string | null
    created_at: string
  }>
  error?: string
}> {
  try {
    const isAdmin = await isPlatformAdmin()
    if (!isAdmin) {
      return { error: 'Unauthorized' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('company_invites')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[v0] listCompanyInvites error:', error)
      return { error: error.message }
    }

    return { invites: data || [] }
  } catch (err) {
    console.error('[v0] listCompanyInvites error:', err)
    return { error: 'Failed to list invites' }
  }
}
