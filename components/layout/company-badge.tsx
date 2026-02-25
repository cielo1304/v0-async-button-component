'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function CompanyBadge() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: member } = await supabase
          .from('team_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (!member?.company_id) return

        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', member.company_id)
          .maybeSingle()

        setCompanyName(company?.name ?? null)
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
        {'Компания: '}
        <span className="text-foreground font-medium">
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
