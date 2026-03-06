'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, X } from 'lucide-react'
import { endViewAsSession, getViewAsSessionInfo } from '@/app/actions/platform'

/**
 * Impersonation session shape (subset for UI display)
 * 
 * Supports both new and legacy field names for backward compatibility
 */
interface ViewAsSession {
  // New impersonation field names
  effectiveCompanyId?: string
  effectiveEmployeeId?: string
  effectiveDisplayName?: string
  companyName: string
  realActorUserId?: string
  
  // Legacy field names (for backward compatibility with old sessions)
  targetCompanyId?: string
  targetEmployeeId?: string
  targetDisplayName?: string
  viewerAdminUserId?: string
}

export function ViewAsBanner() {
  const [session, setSession] = useState<ViewAsSession | null>(null)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    async function checkSession() {
      try {
        const result = await getViewAsSessionInfo()
        if (result.session) {
          setSession(result.session as ViewAsSession)
        }
      } catch {
        // Not in view-as mode
      }
    }
    checkSession()
  }, [])

  const handleExit = async () => {
    setIsExiting(true)
    try {
      await endViewAsSession()
      // Use hard navigation to ensure middleware/SSR re-reads cleared cookie
      // and cleans up any server-side state
      window.location.assign('/platform')
    } catch {
      setIsExiting(false)
    }
  }

  if (!session) return null

  // Support both new and legacy field names
  const displayName = session.effectiveDisplayName || session.targetDisplayName

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 shadow-md">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5 min-w-0">
            <span className="font-semibold whitespace-nowrap">Режим просмотра:</span>
            <span className="text-sm truncate">
              {session.companyName} · {displayName}. Изменения запрещены.
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExit}
          disabled={isExiting}
          className="bg-amber-600 border-amber-700 hover:bg-amber-700 text-amber-50 shrink-0"
        >
          {isExiting ? (
            'Выход...'
          ) : (
            <>
              <X className="h-4 w-4 mr-1" />
              Выйти из просмотра
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
