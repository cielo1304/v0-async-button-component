'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Search, ArrowLeft, Banknote, TrendingUp, AlertTriangle, Pause, X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { CoreDeal, CoreDealStatus, FinanceScheduleType, Contact, Employee } from '@/lib/types/database'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Новая', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ACTIVE: { label: 'Активна', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  PAUSED: { label: 'Пауза', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CLOSED: { label: 'Закрыта', color: 'bg-secondary text-muted-foreground border-border' },
  DEFAULT: { label: 'Дефолт', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  CANCELLED: { label: 'Отменена', color: 'bg-secondary text-muted-foreground border-border' },
}

const SCHEDULE_TYPES: Record<string, string> = {
  annuity: 'Аннуитет',
  diff: 'Дифференцированный',
  interest_only: 'Только %',
  manual: 'Ручной',
  tranches: 'Транши',
}

interface FinanceDealRow {
  id: string
  title: string
  status: CoreDealStatus
  base_currency: string
  contact_id: string | null
  responsible_employee_id: string | null
  created_at: string
  contact?: { id: string; full_name: string; company: string | null } | null
  responsible_employee?: { id: string; full_name: string } | null
  finance_deal?: Array<{
    id: string
    principal_amount: number
    contract_currency: string
    term_months: number
    rate_percent: number
    schedule_type: string
  }>
}

export default function FinanceDealsPage() {
  const supabase = createClient()
  const [deals, setDeals] = useState<FinanceDealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // Форма создания
  const [form, setForm] = useState({
    title: '',
    contact_id: '',
    responsible_employee_id: '',
    base_currency: 'USD',
    principal_amount: '',
    contract_currency: 'USD',
    term_months: '12',
    rate_percent: '2',
    schedule_type: 'interest_only' as FinanceScheduleType,
  })

  const loadDeals = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('core_deals')
      .select(`
        *,
        contact:contacts!core_deals_contact_id_fkey(id, full_name, company),
        responsible_employee:employees!core_deals_responsible_employee_id_fkey(id, full_name),
        finance_deal:finance_deals!finance_deals_core_deal_id_fkey(id, principal_amount, contract_currency, term_months, rate_percent, schedule_type)
      `)
      .eq('kind', 'finance')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Ошибка загрузки финансовых сделок')
    } else {
      setDeals((data || []) as FinanceDealRow[])
    }
    setLoading(false)
  }, [supabase])

  const loadReferences = useCallback(async () => {
    const [cRes, eRes] = await Promise.all([
      supabase.from('contacts').select('id, full_name, company').order('full_name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setContacts((cRes.data || []) as Contact[])
    setEmployees((eRes.data || []) as Employee[])
  }, [supabase])

  useEffect(() => { loadDeals(); loadReferences() }, [loadDeals, loadReferences])

  const handleCreate = async () => {
    if (!form.title || !form.principal_amount) {
      toast.error('Заполните название и сумму')
      return
    }

    // Создаём core_deal
    const { data: core, error: coreErr } = await supabase
      .from('core_deals')
      .insert({
        kind: 'finance',
        status: 'NEW',
        title: form.title,
        base_currency: form.base_currency,
        contact_id: form.contact_id || null,
        responsible_employee_id: form.responsible_employee_id || null,
      })
      .select()
      .single()

    if (coreErr) { toast.error('Ошибка создания сделки'); return }

    // Создаём finance_deal
    const { error: fdErr } = await supabase
      .from('finance_deals')
      .insert({
        core_deal_id: core.id,
        principal_amount: parseFloat(form.principal_amount),
        contract_currency: form.contract_currency,
        term_months: parseInt(form.term_months),
        rate_percent: parseFloat(form.rate_percent),
        schedule_type: form.schedule_type,
      })

    if (fdErr) { toast.error('Ошибка создания параметров'); return }

    toast.success('Финансовая сделка создана')
    setIsCreateOpen(false)
    setForm({ title: '', contact_id: '', responsible_employee_id: '', base_currency: 'USD', principal_amount: '', contract_currency: 'USD', term_months: '12', rate_percent: '2', schedule_type: 'interest_only' })
    loadDeals()
  }

  const filtered = deals.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!d.title.toLowerCase().includes(q) && !d.contact?.full_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const formatMoney = (n: number | null | undefined, cur?: string) => {
    if (n == null) return '-'
    return `${n.toLocaleString('ru-RU')} ${cur || ''}`
  }

  // Агрегация
  const totalPrincipal = deals.reduce((s, d) => s + (d.finance_deal?.[0]?.principal_amount || 0), 0)
  const activeCount = deals.filter(d => d.status === 'ACTIVE').length
  const defaultCount = deals.filter(d => d.status === 'DEFAULT').length
  const pausedCount = deals.filter(d => d.status === 'PAUSED').length

  return (
    <div className="space-y-6 p-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="bg-transparent"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Финансовые сделки</h1>
            <p className="text-sm text-muted-foreground">Кредиты, займы, рассрочки с графиком и залогами</p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Новая сделка
        </Button>
      </div>

      {/* Карточки-саммари */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Banknote className="h-4 w-4" /> Всего тело</div>
          <p className="text-xl font-bold text-foreground">{formatMoney(totalPrincipal, 'USD')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4 text-emerald-400" /> Активных</div>
          <p className="text-xl font-bold text-foreground">{activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><AlertTriangle className="h-4 w-4 text-red-400" /> Дефолт</div>
          <p className="text-xl font-bold text-foreground">{defaultCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Pause className="h-4 w-4 text-amber-400" /> На паузе</div>
          <p className="text-xl font-bold text-foreground">{pausedCount}</p>
        </CardContent></Card>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск по названию или контакту..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Таблица */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Контакт</TableHead>
                <TableHead>Сумма</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Ставка</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Нет финансовых сделок</TableCell></TableRow>
              ) : filtered.map(d => {
                const fd = d.finance_deal?.[0]
                const st = STATUS_MAP[d.status] || { label: d.status, color: 'bg-secondary text-muted-foreground border-border' }
                return (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.href = `/finance-deals/${d.id}`}>
                    <TableCell className="font-medium text-foreground">{d.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.contact?.full_name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{formatMoney(fd?.principal_amount, fd?.contract_currency)}</TableCell>
                    <TableCell className="text-sm">{fd?.term_months || '-'} мес</TableCell>
                    <TableCell className="text-sm">{fd?.rate_percent != null ? `${fd.rate_percent}%` : '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fd?.schedule_type ? SCHEDULE_TYPES[fd.schedule_type] || fd.schedule_type : '-'}</TableCell>
                    <TableCell><Badge variant="outline" className={st.color}>{st.label}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(d.created_at).toLocaleDateString('ru-RU')}</TableCell>
                    <TableCell>
                      <Link href={`/finance-deals/${d.id}`} onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent"><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Диалог создания */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая финансовая сделка</DialogTitle>
            <DialogDescription>Создание кредита, займа или рассрочки</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input placeholder="Например: Займ Иванову на BMW" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Контакт</Label>
                <Select value={form.contact_id || 'none'} onValueChange={v => setForm(p => ({ ...p, contact_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указан</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ответственный</Label>
                <Select value={form.responsible_employee_id || 'none'} onValueChange={v => setForm(p => ({ ...p, responsible_employee_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указан</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Сумма (тело долга) *</Label>
                <Input type="number" placeholder="100000" value={form.principal_amount} onChange={e => setForm(p => ({ ...p, principal_amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={form.contract_currency} onValueChange={v => setForm(p => ({ ...p, contract_currency: v, base_currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'GEL', 'RUB', 'USDT', 'BTC'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Срок (мес)</Label>
                <Input type="number" value={form.term_months} onChange={e => setForm(p => ({ ...p, term_months: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ставка %</Label>
                <Input type="number" step="0.1" value={form.rate_percent} onChange={e => setForm(p => ({ ...p, rate_percent: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Тип графика</Label>
                <Select value={form.schedule_type} onValueChange={v => setForm(p => ({ ...p, schedule_type: v as FinanceScheduleType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={handleCreate}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
