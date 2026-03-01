/**
 * Platform Admin "View-As" Session Management
 * 
 * Allows platform super-admins to view the app as any employee in read-only mode.
 * Uses signed cookies to store view-as session data.
 */

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

// Cookie name for view-as session
export const VIEW_AS_COOKIE = 'mutka_view_as'

// Session expiry in seconds (30 minutes)
const VIEW_AS_EXPIRY_SECONDS = 30 * 60

// Secret for signing/verifying the JWT
function getSecret(): Uint8Array {
  const secret = process.env.VIEW_AS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('Missing VIEW_AS_SECRET or SUPABASE_SERVICE_ROLE_KEY')
  }
  return new TextEncoder().encode(secret)
}

export interface ViewAsSession {
  targetUserId: string        // auth.users.id of the employee being viewed
  targetCompanyId: string     // company.id
  targetEmployeeId: string    // employees.id
  targetDisplayName: string   // Display name of the employee
  companyName: string         // Company name for UI display
  viewerAdminUserId: string   // auth.users.id of the platform admin
  mode: 'readonly_view_as'
  exp: number                 // Expiry timestamp
}

/**
 * Create a view-as session cookie
 */
export async function createViewAsSession(data: Omit<ViewAsSession, 'mode' | 'exp'>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + VIEW_AS_EXPIRY_SECONDS
  
  const payload: ViewAsSession = {
    ...data,
    mode: 'readonly_view_as',
    exp,
  }

  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(getSecret())

  return token
}

/**
 * Get current view-as session from cookies (server-side)
 * Returns null if no valid session exists
 */
export async function getViewAsSession(): Promise<ViewAsSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(VIEW_AS_COOKIE)?.value
    
    if (!token) return null

    const { payload } = await jwtVerify(token, getSecret())
    const session = payload as unknown as ViewAsSession

    // Verify mode and expiry
    if (session.mode !== 'readonly_view_as') return null
    if (session.exp < Math.floor(Date.now() / 1000)) return null

    return session
  } catch {
    return null
  }
}

/**
 * Check if currently in view-as mode (server-side)
 */
export async function isReadOnlyViewMode(): Promise<boolean> {
  const session = await getViewAsSession()
  return session !== null
}

/**
 * Set the view-as cookie
 */
export async function setViewAsCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: VIEW_AS_EXPIRY_SECONDS,
    path: '/',
  })
}

/**
 * Clear the view-as cookie
 */
export async function clearViewAsCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
}

/**
 * Throw if in read-only view mode
 * Call this at the start of any server action that modifies data
 */
export async function assertNotReadOnly(): Promise<void> {
  const isReadOnly = await isReadOnlyViewMode()
  if (isReadOnly) {
    const error = new Error('Режим просмотра: изменения запрещены.')
    ;(error as Error & { code: string }).code = 'read_only_mode'
    throw error
  }
}
