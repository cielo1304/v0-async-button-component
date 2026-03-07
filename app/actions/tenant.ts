'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { getLockedCompanyScope, getViewAsSession } from '@/lib/view-as'

/**
 * Get the current user's team membership.
 * 
 * COMPATIBILITY ADAPTER ONLY - NOT FOR AUTHORIZATION
 * 
 * In View-As mode, returns a SYNTHETIC membership object for UI compatibility.
 * This synthetic object:
 * - MUST NOT be used for authorization decisions
 * - MUST NOT be used for company scope resolution (use getCompanyId() instead)
 * - MUST NOT be used to determine if user is a real tenant member
 * - Is ONLY for UI components that need membership-shaped data for display
 * 
 * Authorization and company scope MUST use:
 * - getCompanyId() for company scope resolution
 * - getActingEmployeeId() for employee resolution
 * - getLockedCompanyScope() for raw View-As scope check
 * - isPlatformAdmin() for admin status
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
  /** 
   * TRUE if this is a synthetic membership from View-As session.
   * Callers MUST check this flag and NOT use synthetic membership for auth decisions.
   */
  isImpersonation?: boolean
  /**
   * Explicit warning that this membership is for UI compatibility only.
   * Present only when isImpersonation is true.
   */
  _syntheticWarning?: string
}> {
  try {
    // Check for View-As scope lock first
    const session = await getViewAsSession()
    if (session?.effectiveCompanyId) {
      // Return SYNTHETIC membership for UI COMPATIBILITY ONLY
      // This is NOT a real membership and MUST NOT be used for:
      // - Authorization decisions
      // - Company scope resolution
      // - Determining tenant membership status
      return {
        membership: {
          id: 'synthetic-impersonation-ui-only',
          user_id: session.realActorUserId,
          company_id: session.effectiveCompanyId,
          role: 'viewer', // View-As is always read-only viewer
          created_at: new Date().toISOString(),
        },
        isImpersonation: true,
        _syntheticWarning: 'This membership is SYNTHETIC for UI compatibility only. Do NOT use for auth.',
      }
    }

    // Normal mode: look up via team_members
    const { supabase, user } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[getMyMembership] DB error:', error)
      return { error: error.message }
    }

    return { membership: data, isImpersonation: false }
  } catch (err) {
    console.error('[getMyMembership] error:', err)
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
    const { supabase } = await createSupabaseAndRequireUser()

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
/**
 * Accept an employee invite and link to existing employee record
 */
export async function acceptEmployeeInvite(
  token: string
): Promise<{ employeeId?: string; error?: string }> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

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
