/**
 * Platform Admin "View-As" Session Management (Auth-Based Impersonation)
 * 
 * Allows platform super-admins to view the app as any employee in read-only mode.
 * Uses signed cookies to store impersonation session data.
 * 
 * KEY DESIGN PRINCIPLES:
 * - NO temporary membership artifacts (team_members, employees) are created
 * - Authorization resolves from impersonation context via service-role queries
 * - Real actor (platform admin) and effective actor (viewed employee) are both preserved
 * - Session contains all info needed for authorization without DB artifacts
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

/**
 * Impersonation Session Shape
 * 
 * Core identities:
 * - realActorUserId: The authenticated platform admin who initiated impersonation
 * - effectiveCompanyId: The company being viewed
 * - effectiveEmployeeId: The employee identity being viewed as
 * 
 * No temporary artifacts are tracked - impersonation is purely session-based.
 */
export interface ViewAsSession {
  // Core impersonation identities
  realActorUserId: string       // auth.users.id of the platform admin (who performed the action)
  effectiveCompanyId: string    // company.id being viewed
  effectiveEmployeeId: string   // employees.id we are "acting as" for permission checks
  
  // Display info for UI
  effectiveDisplayName: string  // Display name of the employee we are viewing as
  companyName: string           // Company name for UI display
  
  // Session metadata
  mode: 'impersonation'         // Identifies this as an impersonation session
  readOnly: true                // Impersonation is always read-only
  exp: number                   // Expiry timestamp
  
  // Guard fields for validation
  platformAdminVerified: true   // Confirms user was verified as platform admin at session start
  
  // LEGACY FIELDS (for backward compatibility during transition only)
  // These are kept to avoid breaking old sessions, but are NOT used in new flow
  targetUserId?: string         // LEGACY: maps to realActorUserId
  targetCompanyId?: string      // LEGACY: maps to effectiveCompanyId
  targetEmployeeId?: string     // LEGACY: maps to effectiveEmployeeId
  targetDisplayName?: string    // LEGACY: maps to effectiveDisplayName
  viewerAdminUserId?: string    // LEGACY: maps to realActorUserId
  createdMembership?: boolean   // LEGACY: cleanup flag (no longer used for new sessions)
  createdTeamMemberId?: string  // LEGACY: cleanup ID (no longer used for new sessions)
  createdViewerEmployeeId?: string // LEGACY: cleanup ID (no longer used for new sessions)
}

/**
 * Input for creating an impersonation session
 */
export interface CreateImpersonationSessionInput {
  realActorUserId: string       // Platform admin who initiated
  effectiveCompanyId: string    // Company being viewed
  effectiveEmployeeId: string   // Employee being viewed as
  effectiveDisplayName: string  // Employee display name
  companyName: string           // Company name for UI
}

/**
 * Create an impersonation session cookie
 * 
 * No temporary membership artifacts are created.
 * The session contains all info needed for authorization resolution.
 */
export async function createViewAsSession(data: CreateImpersonationSessionInput): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + VIEW_AS_EXPIRY_SECONDS
  
  const payload: ViewAsSession = {
    // Core impersonation identities
    realActorUserId: data.realActorUserId,
    effectiveCompanyId: data.effectiveCompanyId,
    effectiveEmployeeId: data.effectiveEmployeeId,
    effectiveDisplayName: data.effectiveDisplayName,
    companyName: data.companyName,
    
    // Session metadata
    mode: 'impersonation',
    readOnly: true,
    exp,
    platformAdminVerified: true,
    
    // LEGACY compatibility fields (mapped from new fields)
    targetUserId: data.realActorUserId,
    targetCompanyId: data.effectiveCompanyId,
    targetEmployeeId: data.effectiveEmployeeId,
    targetDisplayName: data.effectiveDisplayName,
    viewerAdminUserId: data.realActorUserId,
  }

  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(getSecret())

  return token
}

/**
 * Normalize a session to ensure both old and new field names work.
 * This handles backward compatibility with old session tokens.
 */
function normalizeSession(session: ViewAsSession): ViewAsSession {
  // If new fields are missing but legacy fields exist, populate new fields
  if (!session.realActorUserId && session.viewerAdminUserId) {
    session.realActorUserId = session.viewerAdminUserId
  }
  if (!session.effectiveCompanyId && session.targetCompanyId) {
    session.effectiveCompanyId = session.targetCompanyId
  }
  if (!session.effectiveEmployeeId && session.targetEmployeeId) {
    session.effectiveEmployeeId = session.targetEmployeeId
  }
  if (!session.effectiveDisplayName && session.targetDisplayName) {
    session.effectiveDisplayName = session.targetDisplayName
  }
  
  // Ensure readOnly is true for impersonation
  session.readOnly = true
  
  return session
}

/**
 * Get current view-as session from cookies (server-side)
 * Returns null if no valid session exists
 * 
 * Handles both new 'impersonation' mode and legacy 'readonly_view_as' mode
 */
export async function getViewAsSession(): Promise<ViewAsSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(VIEW_AS_COOKIE)?.value
    
    if (!token) return null

    const { payload } = await jwtVerify(token, getSecret())
    const session = payload as unknown as ViewAsSession

    // Verify mode - accept both new and legacy mode values
    const validModes = ['impersonation', 'readonly_view_as']
    if (!validModes.includes(session.mode)) return null
    
    // Verify expiry
    if (session.exp < Math.floor(Date.now() / 1000)) return null

    // Normalize to ensure both old and new field names are populated
    return normalizeSession(session)
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

/**
 * Get impersonation context for use in data fetching.
 * 
 * When in impersonation mode, data fetching should use service-role queries
 * since the platform admin doesn't have RLS access to the target company.
 * 
 * @returns { isImpersonation: boolean, effectiveCompanyId?: string, effectiveEmployeeId?: string }
 */
export async function getImpersonationContext(): Promise<{
  isImpersonation: boolean
  realActorUserId?: string
  effectiveCompanyId?: string
  effectiveEmployeeId?: string
}> {
  const session = await getViewAsSession()
  if (!session) {
    return { isImpersonation: false }
  }
  return {
    isImpersonation: true,
    realActorUserId: session.realActorUserId,
    effectiveCompanyId: session.effectiveCompanyId,
    effectiveEmployeeId: session.effectiveEmployeeId,
  }
}
