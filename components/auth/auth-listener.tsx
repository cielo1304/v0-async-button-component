'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/audit'

/**
 * AuthListener - отслеживает события аутентификации и логирует их в audit_log.
 * Логирует только SIGNED_IN события (не каждый рендер).
 */
export function AuthListener() {
  useEffect(() => {
    const supabase = createClient()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Log only SIGNED_IN events (not TOKEN_REFRESHED or other events)
        if (event === 'SIGNED_IN' && session?.user) {
          const userId = session.user.id
          const userEmail = session.user.email || 'unknown'

          // Get company_id if available from employees table
          let companyId: string | null = null
          try {
            const { data: employee } = await supabase
              .from('employees')
              .select('company_id')
              .eq('auth_user_id', userId)
              .maybeSingle()

            if (employee) {
              companyId = employee.company_id
            }
          } catch (err) {
            console.warn('[auth-listener] Could not fetch company_id:', err)
          }

          // Log sign-in event to audit_log
          await logAudit(supabase, {
            table_name: 'auth_events',
            record_id: userId,
            action: 'INSERT',
            new_data: {
              event: 'sign_in',
              user_id: userId,
              email: userEmail,
              company_id: companyId,
              timestamp: new Date().toISOString(),
            },
            changed_by: userId,
          })

          console.log('[auth-listener] Logged sign-in event for user:', userEmail)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null
}
