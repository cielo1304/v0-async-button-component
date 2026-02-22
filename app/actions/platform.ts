'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'

/**
 * Check if the current user is a platform admin.
 * Uses employees.role_code = 'super' instead of hardcoded email.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    const { data: employee } = await supabase
      .from('employees')
      .select('role_code')
      .eq('auth_user_id', user.id)
      .eq('role_code', 'super')
      .maybeSingle()

    return !!employee
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
    const { supabase, user } = await createSupabaseAndRequireUser()

    // Verify platform admin via role_code
    const { data: employee } = await supabase
      .from('employees')
      .select('role_code')
      .eq('auth_user_id', user.id)
      .eq('role_code', 'super')
      .maybeSingle()

    if (!employee) {
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
    const { supabase, user } = await createSupabaseAndRequireUser()

    // Verify platform admin via role_code
    const { data: employee } = await supabase
      .from('employees')
      .select('role_code')
      .eq('auth_user_id', user.id)
      .eq('role_code', 'super')
      .maybeSingle()

    if (!employee) {
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
