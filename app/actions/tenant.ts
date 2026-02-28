'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'

/**
 * Get the current user's team membership
 */
export async function getMyMembership(): Promise<{
  membership?: {
    id: string
    user_id: string
    company_id: string
    role: string
    created_at: string
  } | null
  error?: string
}> {
  try {
  const { supabase, user } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[v0] getMyMembership error:', error)
      return { error: error.message }
    }

    return { membership: data }
  } catch (err) {
    console.error('[v0] getMyMembership error:', err)
    return { error: 'Failed to get membership' }
  }
}

/**
 * Accept a company invite and create company + team membership
 */
export async function acceptCompanyInvite(
  token: string,
  fullName: string
): Promise<{ companyId?: string; error?: string }> {
  try {
  const { supabase, user } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase.rpc('accept_company_invite', {
      p_token: token,
      p_full_name: fullName,
    })

    if (error) {
      console.error('[v0] accept_company_invite RPC error:', error)
      return { error: error.message }
    }

    return { companyId: data as string }
  } catch (err) {
    console.error('[v0] acceptCompanyInvite error:', err)
    return { error: 'Failed to accept invite' }
  }
}

/**
 * Accept a link-based employee invite.
 * Creates a new employee record + team membership for the current user.
 */
export async function acceptEmployeeInviteLink(
  token: string,
  fullName: string
): Promise<{ employeeId?: string; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase.rpc('accept_employee_invite_link', {
      p_token: token,
      p_full_name: fullName,
    })

    if (error) {
      console.error('[v0] accept_employee_invite_link RPC error:', error)
      return { error: error.message }
    }

    return { employeeId: data as string }
  } catch (err) {
    console.error('[v0] acceptEmployeeInviteLink error:', err)
    return { error: 'Failed to accept invite link' }
  }
}
  token: string
): Promise<{ employeeId?: string; error?: string }> {
  try {
  const { supabase, user } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase.rpc('accept_employee_invite', {
      p_token: token,
    })

    if (error) {
      console.error('[v0] accept_employee_invite RPC error:', error)
      return { error: error.message }
    }

    return { employeeId: data as string }
  } catch (err) {
    console.error('[v0] acceptEmployeeInvite error:', err)
    return { error: 'Failed to accept employee invite' }
  }
}
