'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'

/**
 * Check if the current user is a platform admin.
 * Uses RPC is_platform_admin which checks platform_admins table.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data: isAdmin, error } = await supabase.rpc('is_platform_admin')
    
    if (error) {
      console.error('[v0] is_platform_admin RPC error:', error)
      return false
    }

    return !!isAdmin
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
    const { supabase } = await createSupabaseAndRequireUser()

    // Verify platform admin via RPC
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { error: 'Failed to verify admin status' }
    }

    if (!isAdmin) {
      return { error: 'Unauthorized: Only platform admins can create invites' }
    }

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
    const { supabase } = await createSupabaseAndRequireUser()

    // Verify platform admin via RPC
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { error: 'Failed to verify admin status' }
    }

    if (!isAdmin) {
      return { error: 'Unauthorized' }
    }

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
