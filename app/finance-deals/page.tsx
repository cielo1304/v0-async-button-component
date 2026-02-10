'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, ArrowLeft, Landmark, Users, Calendar, TrendingUp, Pause, AlertTriangle } from 'lucide-react'
import type { CoreDeal, CoreDealStatus, FinanceScheduleType, Contact, Employee } from '@/lib/types/database'
import { toast } from 'sonner'
import Link from 'next/link'

const STATUS_MAP: Record<CoreDealStatus, { label: string; color: string }> = {
  NEW: { label: 'Новая', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ACTIVE: { label: 'Активна', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  PAUSED: { label: 'Пауза', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CLOSED: { label: 'Закрыта', color: 'bg-muted text-muted-foreground border-border' },
  DEFAULT: { label: 'Дефолт', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  CANCELLED: { label: 'Отменена', color: 'bg-muted text-muted-foreground border-border' },
}

const SCHEDULE_TYPE_LABELS: Record<FinanceScheduleType, string> = {
  annuity: 'Аннуитет',
  diff: 'Дифф.',
  interest_only: 'Только %',
  manual: 'Ручной',
  tranches: 'Транши',
}

function formatMoney(amount: number | null | undefined, currency?: string) {
  if (amount == null) return '-'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + (currency ? ` ${currency}` : '')
}

export default function FinanceDealsPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [deals, setDeals] = useState<CoreDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Данные для создания
  const [contacts, setContacts] = useState<Contact[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState({
    title: '',
    contact_id: '',
    responsible_employee_id: '',
    base_currency: 'USD',
    principal_amount: '',
    contract_currency: 'USD',
    term_months: '',
    rate_percent: '',
    schedule_type: 'annuity' as FinanceScheduleType,
  })

  const loadDeals = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('core_deals')
        .select(`
          *,
          contact:contacts(id, full_name),
          responsible_employee:employees(id, full_name),
          finance_deal:finance_deals(id, principal_amount, contract_currency, term_months, rate_percent, schedule_type)
        `)
        .eq('kind', 'finance')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDeals((data || []) as CoreDeal[])
    } catch {
      toast.error('Ошибка загрузки финансовых сделок')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const loadRefs = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('contacts').select('id, full_name').order('full_name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setContacts((c.data || []) as Contact[])
    setEmployees((e.data || []) as Employee[])
  }, [supabase])

  useEffect(() => { loadDeals(); loadRefs() }, [loadDeals, loadRefs])

  const handleCreate = async () => {
    if (!form.title || !form.principal_amount || !form.term_months || !form.rate_percent) {
      toast.error('Заполните обязательные поля')
      return
    }
    try {
      const { data: coreDeal, error: coreErr } = await supabase
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
      if (coreErr) throw coreErr

      const { error: finErr } = await supabase
        .from('finance_deals')
        .insert({
          core_deal_id: coreDeal.id,
          principal_amount: parseFloat(form.principal_amount),
          contract_currency: form.contract_currency,
          term_months: parseInt(form.term_months),
          rate_percent: parseFloat(form.rate_percent),
          schedule_type: form.schedule_type,
        })
      if (finErr) throw finErr

      toast.success('Финансовая сделка создана')
      setIsCreateOpen(false)
      setForm({ title: '', contact_id: '', responsible_employee_id: '', base_currency: 'USD', principal_amount: '', contract_currency: 'USD', term_months: '', rate_percent: '', schedule_type: 'annuity' })
      loadDeals()
    } catch {
      toast.error('Ошибка создания сделки')
    }
  }

  const filtered = deals.filter(d => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.contact as any)?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  // Статистика
  const activeDeals = deals.filter(d => d.status === 'ACTIVE')
  const totalPrincipal = activeDeals.reduce((sum, d) => {
    const fd = (d as any).finance_deal?.[0] || (d as any).finance_deal
    return sum + (fd?.principal_amount || 0)
  }, 0)
  const overdueCount = deals.filter(d => d.status === 'DEFAULT').length
  const pausedCount = deals.filter(d => d.status === 'PAUSED').length

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="bg-transparent">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Финансовые сделки</h1>
            <p className="text-sm text-muted-foreground">Займы, кредиты, рассрочки</p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Новая сделка
        </Button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Активных</p>
                <p className="text-lg font-bold">{activeDeals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Общий капитал</p>
                <p className="text-lg font-bold">{formatMoney(totalPrincipal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Pause className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">На паузе</p>
                <p className="text-lg font-bold">{pausedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Дефолты</p>
                <p className="text-lg font-bold">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Фильтры */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск по названию или контакту..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(STATUS_MAP).map(([code, s]) => (
              <SelectItem key={code} value={code}>{s.label}</SelectItem>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Загрузка...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {search || statusFilter !== 'all' ? 'Ничего не найдено' : 'Нет финансовых сделок'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(deal => {
                const fd = (deal as any).finance_deal?.[0] || (deal as any).finance_deal
                const st = STATUS_MAP[deal.status as CoreDealStatus] || { label: deal.status, color: 'bg-muted text-muted-foreground border-border' }
                return (
                  <TableRow key={deal.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/finance-deals/${deal.id}`)}>
                    <TableCell>
                      <span className="font-medium">{deal.title}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {(deal.contact as any)?.full_name || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {fd ? formatMoney(fd.principal_amount, fd.contract_currency) : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{fd?.term_months ? `${fd.term_months} мес.` : '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{fd?.rate_percent != null ? `${fd.rate_percent}%` : '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {fd?.schedule_type ? SCHEDULE_TYPE_LABELS[fd.schedule_type as FinanceScheduleType] || fd.schedule_type : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.color}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(deal.created_at).toLocaleDateString('ru-RU')}
                      </span>
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
            <DialogDescription>Создайте займ, кредит или рассрочку</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Займ Иванову на авто" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Контакт</Label>
                <Select value={form.contact_id} onValueChange={v => setForm(f => ({ ...f, contact_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ответственный</Label>
                <Select value={form.responsible_employee_id} onValueChange={v => setForm(f => ({ ...f, responsible_employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Сумма *</Label>
                <Input type="number" value={form.principal_amount} onChange={e => setForm(f => ({ ...f, principal_amount: e.target.value }))} placeholder="100000" />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={form.contract_currency} onValueChange={v => setForm(f => ({ ...f, contract_currency: v, base_currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GEL">GEL</SelectItem>
                    <SelectItem value="RUB">RUB</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Срок (мес.) *</Label>
                <Input type="number" value={form.term_months} onChange={e => setForm(f => ({ ...f, term_months: e.target.value }))} placeholder="12" />
              </div>
              <div className="space-y-2">
                <Label>Ставка % *</Label>
                <Input type="number" step="0.1" value={form.rate_percent} onChange={e => setForm(f => ({ ...f, rate_percent: e.target.value }))} placeholder="15" />
              </div>
              <div className="space-y-2">
                <Label>Тип графика</Label>
                <Select value={form.schedule_type} onValueChange={v => setForm(f => ({ ...f, schedule_type: v as FinanceScheduleType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEDULE_TYPE_LABELS).map(([k, v]) => (
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
