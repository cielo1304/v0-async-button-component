'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, X } from 'lucide-react'
import { endViewAsSession, getViewAsSessionInfo } from '@/app/actions/platform'

interface ViewAsSession {
  targetUserId: string
  targetCompanyId: string
  targetEmployeeId: string
  targetDisplayName: string
  companyName: string
  viewerAdminUserId: string
  isReadOnly: true
  createdAt: string
}

export function ViewAsBanner() {
  const router = useRouter()
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
      router.push('/platform')
      router.refresh()
    } catch {
      setIsExiting(false)
    }
  }

  if (!session) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 shadow-md">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-semibold">Режим просмотра (только чтение)</span>
            <span className="text-sm opacity-80">
              Компания: {session.companyName} • Пользователь: {session.targetDisplayName}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExit}
          disabled={isExiting}
          className="bg-amber-600 border-amber-700 hover:bg-amber-700 text-amber-50"
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
