'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, Eye } from 'lucide-react'
import { getEffectiveCompanyName } from '@/app/actions/platform'

/**
 * Company badge component with HARD SCOPE LOCK support.
 * 
 * In View-As mode, displays the impersonated company name (from session),
 * NOT the operator's real company. This prevents A+B scope confusion.
 */
export function CompanyBadge() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [isImpersonation, setIsImpersonation] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Use server action that respects View-As scope lock
        const result = await getEffectiveCompanyName()
        if (result.companyName) {
          setCompanyName(result.companyName)
          setIsImpersonation(result.isImpersonation ?? false)
        }
      } catch {
        // leave null
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground font-mono">
        {isImpersonation && <Eye className="inline h-3.5 w-3.5 mr-1 text-amber-500" />}
        {'Компания: '}
        <span className={`font-medium ${isImpersonation ? 'text-amber-600' : 'text-foreground'}`}>
          {loading ? '...' : (companyName ?? '—')}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1.5">
        <LogOut className="h-4 w-4" />
        {'Выйти'}
      </Button>
    </div>
  )
}
