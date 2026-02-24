'use server'

import { adminSupabase } from '@/lib/supabase/admin'

/**
 * Password policy:
 * - minimum 8 characters
 * - at least one uppercase Latin letter [A-Z]
 * - at least one digit [0-9]
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Пароль должен содержать минимум 8 символов'
  if (!/[A-Z]/.test(password)) return 'Пароль должен содержать хотя бы одну заглавную латинскую букву'
  if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру'
  return null
}

/**
 * Creates a new Supabase Auth user using the service-role admin client.
 * email_confirm is set to true so the user can log in immediately.
 * Only called after a sign-in attempt fails with "Invalid login credentials",
 * meaning the user does not yet exist.
 */
export async function createUserByInvite(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  // Server-side password validation
  const policyError = validatePassword(password)
  if (policyError) return { ok: false, error: policyError }

  const { error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    // Map common Supabase admin errors to user-friendly messages
    if (error.message.includes('already been registered') || error.status === 422) {
      return { ok: false, error: 'Пользователь с таким email уже существует' }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
