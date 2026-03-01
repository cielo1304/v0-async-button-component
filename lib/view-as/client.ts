'use client'

/**
 * Client-side helpers for view-as mode
 */

import { VIEW_AS_COOKIE } from './index'

/**
 * Check if view-as cookie exists (client-side)
 * Note: Cannot verify signature client-side, just checks existence
 */
export function hasViewAsCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(VIEW_AS_COOKIE)
}
