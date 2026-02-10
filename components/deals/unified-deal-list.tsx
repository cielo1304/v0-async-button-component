'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Car, Briefcase, Banknote } from 'lucide-react'
import Link from 'next/link'

interface UnifiedRow {
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
  contact_name?: string
}

const KIND_MAP: Record<string, { label: string; color: string; icon: typeof Briefcase }> = {
  deals: { label: 'Сделка', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Briefcase },
  auto: { label: 'Авто', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Car },
  finance: { label: 'Финансовая', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: Banknote },
}

function getDetailUrl(row: UnifiedRow): string {
  switch (row.kind) {
    case 'deals': return `/deals/${row.entity_id}`
    case 'auto': return `/cars/deals/${row.entity_id}`
    case 'finance': return `/finance-deals/${row.entity_id}`
    default: return '#'
  }
}

export function UnifiedDealList() {
  const supabase = createClient()
  const [rows, setRows] = useState<UnifiedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)

    // Загружаем все три типа параллельно
    const [legacyRes, autoRes, financeRes] = await Promise.all([
      supabase.from('deals').select('id, title, status, amount, currency, contact_id, created_at, contact:contacts!deals_contact_id_fkey(full_name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('auto_deals').select('id, title, status, price, currency, client_id, created_at, client:auto_clients!auto_deals_client_id_fkey(name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('core_deals').select('id, title, status, base_currency, contact_id, created_at, contact:contacts!core_deals_contact_id_fkey(full_name), finance_deal:finance_deals!finance_deals_core_deal_id_fkey(principal_amount, contract_currency)').eq('kind', 'finance').order('created_at', { ascending: false }).limit(300),
    ])

    const result: UnifiedRow[] = []

    for (const d of legacyRes.data || []) {
      const contact = d.contact as unknown as { full_name: string } | null
      result.push({
        unified_id: `deals_${d.id}`, source: 'legacy_deals', entity_id: d.id, kind: 'deals',
        title: d.title || 'Сделка', status: d.status, amount: d.amount, currency: d.currency,
        contact_id: d.contact_id, created_at: d.created_at,
        contact_name: contact?.full_name || undefined,
      })
    }

    for (const d of autoRes.data || []) {
      const client = d.client as unknown as { name: string } | null
      result.push({
        unified_id: `auto_${d.id}`, source: 'auto_deals', entity_id: d.id, kind: 'auto',
        title: d.title || 'Авто', status: d.status, amount: d.price, currency: d.currency,
        contact_id: d.client_id, created_at: d.created_at,
        contact_name: client?.name || undefined,
      })
    }

    for (const d of financeRes.data || []) {
      const contact = d.contact as unknown as { full_name: string } | null
      const fdArr = d.finance_deal as unknown as Array<{ principal_amount: number; contract_currency: string }> | null
      const fd = fdArr?.[0]
      result.push({
        unified_id: `finance_${d.id}`, source: 'finance', entity_id: d.id, kind: 'finance',
        title: d.title || 'Фин. сделка', status: d.status,
        amount: fd?.principal_amount || null,
        currency: fd?.contract_currency || d.base_currency,
        contact_id: d.contact_id, created_at: d.created_at,
        contact_name: contact?.full_name || undefined,
      })
    }

    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setRows(result)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.title.toLowerCase().includes(q) && !(r.contact_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const formatMoney = (n: number | null | undefined, cur?: string | null) => {
    if (n == null) return '-'
    return `${n.toLocaleString('ru-RU')} ${cur || ''}`
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Тип" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="deals">Обычные</SelectItem>
            <SelectItem value="auto">Авто</SelectItem>
            <SelectItem value="finance">Финансовые</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Счётчики */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Всего: {filtered.length}</span>
        <span>Обычных: {filtered.filter(r => r.kind === 'deals').length}</span>
        <span>Авто: {filtered.filter(r => r.kind === 'auto').length}</span>
        <span>Финансовых: {filtered.filter(r => r.kind === 'finance').length}</span>
      </div>

      {/* Таблица */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Тип</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Контакт</TableHead>
            <TableHead>Сумма</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Дата</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
          ) : filtered.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет сделок</TableCell></TableRow>
          ) : filtered.map(r => {
            const km = KIND_MAP[r.kind] || KIND_MAP.deals
            const Icon = km.icon
            return (
              <TableRow key={r.unified_id} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  <Badge variant="outline" className={km.color}>
                    <Icon className="h-3 w-3 mr-1" />{km.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link href={getDetailUrl(r)} className="font-medium text-foreground hover:underline">{r.title}</Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.contact_name || '-'}</TableCell>
                <TableCell className="font-mono text-sm">{formatMoney(r.amount, r.currency)}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString('ru-RU')}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
