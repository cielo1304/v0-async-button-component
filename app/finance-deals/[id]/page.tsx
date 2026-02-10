'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Banknote, Users, Calendar, Shield, Link2, Clock,
  Plus, Trash2, PlayCircle, PauseCircle, XCircle, CheckCircle2,
  AlertTriangle, TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type {
  CoreDeal, CoreDealStatus, FinanceDeal, FinanceParticipant,
  FinancePaymentScheduleItem, FinanceLedgerEntry, FinanceCollateralLink,
  FinancePausePeriod, FinanceCollateralChain, Contact, Employee, Asset
} from '@/lib/types/database'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Новая', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ACTIVE: { label: 'Активна', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  PAUSED: { label: 'Пауза', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CLOSED: { label: 'Закрыта', color: 'bg-secondary text-muted-foreground border-border' },
  DEFAULT: { label: 'Дефолт', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  CANCELLED: { label: 'Отменена', color: 'bg-secondary text-muted-foreground border-border' },
}

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  PLANNED: { label: 'Запланировано', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  PAID: { label: 'Оплачено', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  OVERDUE: { label: 'Просрочено', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ADJUSTED: { label: 'Скорректировано', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
}

const ENTRY_TYPES: Record<string, string> = {
  disbursement: 'Выдача',
  repayment_principal: 'Возврат тела',
  repayment_interest: 'Возврат %',
  fee: 'Комиссия',
  penalty_manual: 'Штраф/пеня',
  adjustment: 'Корректировка',
  offset: 'Взаимозачёт',
  collateral_sale_proceeds: 'Продажа залога',
}

const COLLATERAL_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активный', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  released: { label: 'Снят', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  foreclosed: { label: 'Взыскан', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  replaced: { label: 'Заменён', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
}

export default function FinanceDealDetailPage() {
  const params = useParams()
  const coreDealId = params.id as string
  const supabase = createClient()

  const [core, setCore] = useState<CoreDeal | null>(null)
  const [fd, setFd] = useState<FinanceDeal | null>(null)
  const [participants, setParticipants] = useState<FinanceParticipant[]>([])
  const [schedule, setSchedule] = useState<FinancePaymentScheduleItem[]>([])
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([])
  const [collaterals, setCollaterals] = useState<FinanceCollateralLink[]>([])
  const [pauses, setPauses] = useState<FinancePausePeriod[]>([])
  const [chain, setChain] = useState<FinanceCollateralChain[]>([])
  const [loading, setLoading] = useState(true)

  // Справочники
  const [contacts, setContacts] = useState<Contact[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assets, setAssets] = useState<Asset[]>([])

  // Диалоги
  const [isLedgerOpen, setIsLedgerOpen] = useState(false)
  const [isCollateralOpen, setIsCollateralOpen] = useState(false)
  const [isParticipantOpen, setIsParticipantOpen] = useState(false)

  // Формы
  const [ledgerForm, setLedgerForm] = useState({ entry_type: 'repayment_principal', amount: '', currency: 'USD', note: '' })
  const [collateralForm, setCollateralForm] = useState({ asset_id: '', note: '' })
  const [participantForm, setParticipantForm] = useState({ contact_id: '', employee_id: '', participant_role: 'borrower', is_primary: false, note: '' })

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: coreData } = await supabase
        .from('core_deals')
        .select('*, contact:contacts!core_deals_contact_id_fkey(id, full_name, company, phone), responsible_employee:employees!core_deals_responsible_employee_id_fkey(id, full_name)')
        .eq('id', coreDealId)
        .single()
      if (coreData) setCore(coreData as CoreDeal)

      const { data: fdData } = await supabase.from('finance_deals').select('*').eq('core_deal_id', coreDealId).single()
      if (fdData) {
        setFd(fdData as FinanceDeal)
        const fdId = fdData.id

        const [pRes, sRes, lRes, colRes, pauseRes, chainRes] = await Promise.all([
          supabase.from('finance_participants').select('*, contact:contacts(id, full_name, company), employee:employees(id, full_name)').eq('finance_deal_id', fdId).order('is_primary', { ascending: false }),
          supabase.from('finance_payment_schedule').select('*').eq('finance_deal_id', fdId).order('due_date'),
          supabase.from('finance_ledger').select('*, created_by_employee:employees!finance_ledger_created_by_employee_id_fkey(id, full_name)').eq('finance_deal_id', fdId).order('occurred_at', { ascending: false }),
          supabase.from('finance_collateral_links').select('*, asset:assets(id, title, asset_type, status)').eq('finance_deal_id', fdId).order('started_at', { ascending: false }),
          supabase.from('finance_pause_periods').select('*').eq('finance_deal_id', fdId).order('start_date', { ascending: false }),
          supabase.from('finance_collateral_chain').select('*, old_asset:assets!finance_collateral_chain_old_asset_id_fkey(id, title), new_asset:assets!finance_collateral_chain_new_asset_id_fkey(id, title)').eq('finance_deal_id', fdId).order('created_at', { ascending: false }),
        ])

        setParticipants((pRes.data || []) as FinanceParticipant[])
        setSchedule((sRes.data || []) as FinancePaymentScheduleItem[])
        setLedger((lRes.data || []) as FinanceLedgerEntry[])
        setCollaterals((colRes.data || []) as FinanceCollateralLink[])
        setPauses((pauseRes.data || []) as FinancePausePeriod[])
        setChain((chainRes.data || []) as FinanceCollateralChain[])
      }

      // Справочники
      const [cRes, eRes, aRes] = await Promise.all([
        supabase.from('contacts').select('id, full_name, company').order('full_name'),
        supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('assets').select('id, title, asset_type, status').in('status', ['in_stock', 'company_owned']).order('title'),
      ])
      setContacts((cRes.data || []) as Contact[])
      setEmployees((eRes.data || []) as Employee[])
      setAssets((aRes.data || []) as Asset[])
    } catch {
      toast.error('Ошибка загрузки данных')
    }
    setLoading(false)
  }, [coreDealId, supabase])

  useEffect(() => { loadAll() }, [loadAll])

  const updateStatus = async (status: CoreDealStatus) => {
    const { error } = await supabase.from('core_deals').update({ status }).eq('id', coreDealId)
    if (error) { toast.error('Ошибка обновления статуса'); return }
    toast.success(`Статус изменён на ${STATUS_MAP[status]?.label || status}`)
    loadAll()
  }

  const addLedgerEntry = async () => {
    if (!fd || !ledgerForm.amount) return
    const { error } = await supabase.from('finance_ledger').insert({
      finance_deal_id: fd.id,
      entry_type: ledgerForm.entry_type,
      amount: parseFloat(ledgerForm.amount),
      currency: ledgerForm.currency,
      base_amount: parseFloat(ledgerForm.amount),
      base_currency: ledgerForm.currency,
      note: ledgerForm.note || null,
    })
    if (error) { toast.error('Ошибка добавления записи'); return }
    toast.success('Запись добавлена в леджер')
    setIsLedgerOpen(false)
    setLedgerForm({ entry_type: 'repayment_principal', amount: '', currency: 'USD', note: '' })
    loadAll()
  }

  const addCollateral = async () => {
    if (!fd || !collateralForm.asset_id) return
    const { error } = await supabase.from('finance_collateral_links').insert({
      finance_deal_id: fd.id,
      asset_id: collateralForm.asset_id,
      status: 'active',
      note: collateralForm.note || null,
    })
    if (error) { toast.error('Ошибка привязки залога'); return }
    await supabase.from('assets').update({ status: 'pledged' }).eq('id', collateralForm.asset_id)
    toast.success('Залог привязан')
    setIsCollateralOpen(false)
    setCollateralForm({ asset_id: '', note: '' })
    loadAll()
  }

  const releaseCollateral = async (linkId: string, assetId: string) => {
    await supabase.from('finance_collateral_links').update({ status: 'released', ended_at: new Date().toISOString() }).eq('id', linkId)
    await supabase.from('assets').update({ status: 'released' }).eq('id', assetId)
    toast.success('Залог снят')
    loadAll()
  }

  const addParticipant = async () => {
    if (!fd) return
    const { error } = await supabase.from('finance_participants').insert({
      finance_deal_id: fd.id,
      contact_id: participantForm.contact_id || null,
      employee_id: participantForm.employee_id || null,
      participant_role: participantForm.participant_role,
      is_primary: participantForm.is_primary,
      note: participantForm.note || null,
    })
    if (error) { toast.error('Ошибка добавления участника'); return }
    toast.success('Участник добавлен')
    setIsParticipantOpen(false)
    setParticipantForm({ contact_id: '', employee_id: '', participant_role: 'borrower', is_primary: false, note: '' })
    loadAll()
  }

  const removeParticipant = async (id: string) => {
    await supabase.from('finance_participants').delete().eq('id', id)
    toast.success('Участник удалён')
    loadAll()
  }

  const formatMoney = (n: number | null | undefined, cur?: string) => {
    if (n == null) return '-'
    return `${n.toLocaleString('ru-RU')} ${cur || ''}`
  }

  if (loading) return <div className="p-6 text-muted-foreground">Загрузка...</div>
  if (!core || !fd) return <div className="p-6 text-muted-foreground">Сделка не найдена</div>

  const st = STATUS_MAP[core.status] || { label: core.status, color: 'bg-secondary text-muted-foreground border-border' }

  // Расчёт баланса из леджера
  const totalDisbursed = ledger.filter(l => l.entry_type === 'disbursement').reduce((s, l) => s + (l.amount || 0), 0)
  const totalRepaidPrincipal = ledger.filter(l => l.entry_type === 'repayment_principal').reduce((s, l) => s + (l.amount || 0), 0)
  const totalRepaidInterest = ledger.filter(l => l.entry_type === 'repayment_interest').reduce((s, l) => s + (l.amount || 0), 0)
  const outstanding = totalDisbursed - totalRepaidPrincipal

  return (
    <div className="space-y-6 p-6">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance-deals">
            <Button variant="ghost" size="icon" className="bg-transparent"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{core.title}</h1>
              <Badge variant="outline" className={st.color}>{st.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {(core as unknown as { contact?: { full_name: string } }).contact?.full_name || 'Контакт не указан'}
              {(core as unknown as { responsible_employee?: { full_name: string } }).responsible_employee && ` | Отв.: ${(core as unknown as { responsible_employee: { full_name: string } }).responsible_employee.full_name}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {core.status === 'NEW' && <Button size="sm" onClick={() => updateStatus('ACTIVE')}><PlayCircle className="h-4 w-4 mr-1" />Активировать</Button>}
          {core.status === 'ACTIVE' && <Button size="sm" variant="outline" className="bg-transparent" onClick={() => updateStatus('PAUSED')}><PauseCircle className="h-4 w-4 mr-1" />Пауза</Button>}
          {core.status === 'PAUSED' && <Button size="sm" onClick={() => updateStatus('ACTIVE')}><PlayCircle className="h-4 w-4 mr-1" />Возобновить</Button>}
          {core.status !== 'CLOSED' && core.status !== 'CANCELLED' && (
            <Button size="sm" variant="outline" className="bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => updateStatus('CLOSED')}><CheckCircle2 className="h-4 w-4 mr-1" />Закрыть</Button>
          )}
        </div>
      </div>

      {/* Карточки сводки */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Тело долга</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(fd.principal_amount, fd.contract_currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Выдано</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(totalDisbursed, fd.contract_currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Остаток долга</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(outstanding, fd.contract_currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Возврат %</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(totalRepaidInterest, fd.contract_currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Ставка / Срок</p>
          <p className="text-lg font-bold text-foreground">{fd.rate_percent}% / {fd.term_months} мес</p>
        </CardContent></Card>
      </div>

      {/* Табы */}
      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger" className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Леджер</TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />График</TabsTrigger>
          <TabsTrigger value="collateral" className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" />Залоги</TabsTrigger>
          <TabsTrigger value="participants" className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Участники</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />История</TabsTrigger>
        </TabsList>

        {/* Леджер */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Леджер движений</CardTitle>
              <Button size="sm" onClick={() => setIsLedgerOpen(true)}><Plus className="h-4 w-4 mr-1" />Добавить</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Примечание</TableHead>
                    <TableHead>Кто</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет записей</TableCell></TableRow>
                  ) : ledger.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{new Date(l.occurred_at).toLocaleDateString('ru-RU')}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{ENTRY_TYPES[l.entry_type] || l.entry_type}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{formatMoney(l.amount, l.currency)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.note || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(l as unknown as { created_by_employee?: { full_name: string } }).created_by_employee?.full_name || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* График платежей */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader><CardTitle className="text-base">График платежей</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тело</TableHead>
                    <TableHead>Проценты</TableHead>
                    <TableHead>Итого</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">График не сформирован</TableCell></TableRow>
                  ) : schedule.map(s => {
                    const ps = PAYMENT_STATUS[s.status] || { label: s.status, color: 'bg-secondary text-muted-foreground border-border' }
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{new Date(s.due_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell className="font-mono text-sm">{formatMoney(s.principal_due, s.currency)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatMoney(s.interest_due, s.currency)}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">{formatMoney(s.total_due, s.currency)}</TableCell>
                        <TableCell><Badge variant="outline" className={ps.color}>{ps.label}</Badge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Залоги */}
        <TabsContent value="collateral">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Залоговое имущество</CardTitle>
              <Button size="sm" onClick={() => setIsCollateralOpen(true)}><Plus className="h-4 w-4 mr-1" />Привязать залог</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Актив</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус залога</TableHead>
                    <TableHead>Дата привязки</TableHead>
                    <TableHead>Примечание</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collaterals.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет залогов</TableCell></TableRow>
                  ) : collaterals.map(c => {
                    const cs = COLLATERAL_STATUS[c.status] || { label: c.status, color: 'bg-secondary text-muted-foreground border-border' }
                    const asset = (c as unknown as { asset?: { id: string; title: string; asset_type: string; status: string } }).asset
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          {asset ? (
                            <Link href={`/assets/${asset.id}`} className="text-sm font-medium hover:underline text-foreground">{asset.title}</Link>
                          ) : <span className="text-sm text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{asset?.asset_type || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={cs.color}>{cs.label}</Badge></TableCell>
                        <TableCell className="text-sm">{new Date(c.started_at).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{c.note || '-'}</TableCell>
                        <TableCell>
                          {c.status === 'active' && (
                            <Button variant="ghost" size="sm" className="text-xs bg-transparent" onClick={() => asset && releaseCollateral(c.id, asset.id)}>
                              Снять
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Цепочка замен */}
              {chain.length > 0 && (
                <>
                  <Separator />
                  <div className="p-4">
                    <h4 className="text-sm font-medium mb-3">Цепочка замен залогов</h4>
                    <div className="space-y-2">
                      {chain.map(ch => (
                        <div key={ch.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" />
                          <span>{(ch as unknown as { old_asset?: { title: string } }).old_asset?.title || '?'}</span>
                          <span>{'-->'}</span>
                          <span>{(ch as unknown as { new_asset?: { title: string } }).new_asset?.title || '?'}</span>
                          <span className="text-xs">({ch.reason || 'без причины'})</span>
                          <span className="text-xs">{new Date(ch.created_at).toLocaleDateString('ru-RU')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Участники */}
        <TabsContent value="participants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Участники сделки</CardTitle>
              <Button size="sm" onClick={() => setIsParticipantOpen(true)}><Plus className="h-4 w-4 mr-1" />Добавить</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Роль</TableHead>
                    <TableHead>Контакт / Сотрудник</TableHead>
                    <TableHead>Основной</TableHead>
                    <TableHead>Примечание</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет участников</TableCell></TableRow>
                  ) : participants.map(p => (
                    <TableRow key={p.id}>
                      <TableCell><Badge variant="outline">{p.participant_role}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {(p as unknown as { contact?: { full_name: string } }).contact?.full_name || (p as unknown as { employee?: { full_name: string } }).employee?.full_name || '-'}
                      </TableCell>
                      <TableCell>{p.is_primary ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Да</Badge> : <span className="text-muted-foreground text-sm">Нет</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.note || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 bg-transparent" onClick={() => removeParticipant(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* История */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Паузы и события</CardTitle></CardHeader>
            <CardContent>
              {pauses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет пауз</p>
              ) : (
                <div className="space-y-3">
                  {pauses.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      <PauseCircle className="h-4 w-4 text-amber-400" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Пауза: {new Date(p.start_date).toLocaleDateString('ru-RU')} - {p.end_date ? new Date(p.end_date).toLocaleDateString('ru-RU') : 'по сей день'}
                        </p>
                        {p.reason && <p className="text-xs text-muted-foreground">{p.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Диалог добавления записи в леджер */}
      <Dialog open={isLedgerOpen} onOpenChange={setIsLedgerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить запись в леджер</DialogTitle>
            <DialogDescription>Фиксация выдачи, возврата или другой операции</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Тип операции</Label>
              <Select value={ledgerForm.entry_type} onValueChange={v => setLedgerForm(p => ({ ...p, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ENTRY_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Сумма</Label>
                <Input type="number" value={ledgerForm.amount} onChange={e => setLedgerForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={ledgerForm.currency} onValueChange={v => setLedgerForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'GEL', 'RUB', 'USDT'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea value={ledgerForm.note} onChange={e => setLedgerForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLedgerOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={addLedgerEntry}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог привязки залога */}
      <Dialog open={isCollateralOpen} onOpenChange={setIsCollateralOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Привязать залог</DialogTitle>
            <DialogDescription>Выберите актив из имущества для залога</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Актив</Label>
              <Select value={collateralForm.asset_id || 'none'} onValueChange={v => setCollateralForm(p => ({ ...p, asset_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите актив" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не выбран</SelectItem>
                  {assets.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.title} ({a.asset_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea value={collateralForm.note} onChange={e => setCollateralForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCollateralOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={addCollateral}>Привязать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог добавления участника */}
      <Dialog open={isParticipantOpen} onOpenChange={setIsParticipantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить участника</DialogTitle>
            <DialogDescription>Заёмщик, поручитель, инвестор и т.д.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={participantForm.participant_role} onValueChange={v => setParticipantForm(p => ({ ...p, participant_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['borrower', 'lender', 'guarantor', 'investor', 'observer'].map(r => (
                    <SelectItem key={r} value={r}>{{ borrower: 'Заёмщик', lender: 'Кредитор', guarantor: 'Поручитель', investor: 'Инвестор', observer: 'Наблюдатель' }[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Контакт</Label>
                <Select value={participantForm.contact_id || 'none'} onValueChange={v => setParticipantForm(p => ({ ...p, contact_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбран</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Сотрудник</Label>
                <Select value={participantForm.employee_id || 'none'} onValueChange={v => setParticipantForm(p => ({ ...p, employee_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбран</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea value={participantForm.note} onChange={e => setParticipantForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsParticipantOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={addParticipant}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
