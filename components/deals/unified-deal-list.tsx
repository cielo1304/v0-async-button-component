'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { canViewByVisibility } from '@/lib/access'
import { VisibilityBadge } from '@/components/shared/visibility-toggle'

interface UnifiedDeal {
  unified_id: string
  source: string
  entity_id: string
  kind: string
  title: string
  status: string
  amount: number | null
  currency: string | null
  contact_id: string | null
  created_at: string
}

const SOURCE_LABELS: Record<string, string> = {
  legacy_deals: 'Контракт',
  auto_deals: 'Авто',
  finance: 'Финансовая',
}

const SOURCE_COLORS: Record<string, string> = {
  legacy_deals: 'bg-amber-500/10 text-amber-400',
  auto_deals: 'bg-purple-500/10 text-purple-400',
  finance: 'bg-blue-500/10 text-blue-400',
}

function getLink(deal: UnifiedDeal): string {
  switch (deal.source) {
    case 'legacy_deals':
      return `/deals/${deal.entity_id}`
    case 'auto_deals':
      return `/cars/deals/${deal.entity_id}`
    case 'finance':
      return `/finance-deals/${deal.entity_id}`
    default:
      return '#'
  }
}

export function UnifiedDealList() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [deals, setDeals] = useState<UnifiedDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState<string>('all')

  useEffect(() => {
    loadDeals()
  }, [])

  async function loadDeals() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('v_deals_unified')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setDeals(data as UnifiedDeal[])
    }
    setIsLoading(false)
  }

  const visibleDeals = deals.filter(d => canViewByVisibility([], d as any))
  const filtered = kindFilter === 'all'
    ? visibleDeals
    : visibleDeals.filter(d => d.source === kindFilter)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Фильтр по типу" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="legacy_deals">Контракты</SelectItem>
            <SelectItem value="auto_deals">Автосделки</SelectItem>
            <SelectItem value="finance">Финансовые</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} {'сделок'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">Нет сделок</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((deal) => (
              <TableRow
                key={deal.unified_id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => router.push(getLink(deal))}
              >
                <TableCell>
                  <Badge variant="secondary" className={SOURCE_COLORS[deal.source] || ''}>
                    {SOURCE_LABELS[deal.source] || deal.source}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{deal.title}</span>
                    <VisibilityBadge mode={(deal as any).visibility_mode} count={(deal as any).allowed_role_codes?.length} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(deal.created_at), 'd MMM yyyy', { locale: ru })}
                </TableCell>
                <TableCell className="font-mono">
                  {deal.amount != null ? `${deal.amount.toLocaleString()} ${deal.currency || ''}` : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={deal.status === 'COMPLETED' || deal.status === 'completed' ? 'default' : 'secondary'}>
                    {deal.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
