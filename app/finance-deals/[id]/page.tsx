'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Landmark, Users, Calendar, TrendingUp, Plus, Pause, Play,
  AlertTriangle, DollarSign, Package, History, UserPlus, Link2, Trash2, ChevronDown
} from 'lucide-react'
import type {
  CoreDeal, CoreDealStatus, FinanceDeal, FinanceLedgerEntry,
  FinanceLedgerEntryType, FinancePaymentScheduleItem, FinanceParticipant,
  FinanceCollateralLink, FinancePausePeriod, Contact, Employee, Asset
} from '@/lib/types/database'
import { toast } from 'sonner'
import Link from 'next/link'
import { computeBalances, totalPausedDays } from '@/lib/finance/math'
import { regenerateSchedule, pauseDeal, resumeDeal, deletePause } from '@/app/actions/finance-engine'

const STATUS_MAP: Record<CoreDealStatus, { label: string; color: string }> = {
  NEW: { label: 'Новая', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ACTIVE: { label: 'Активна', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  PAUSED: { label: 'Пауза', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CLOSED: { label: 'Закрыта', color: 'bg-muted text-muted-foreground border-border' },
  DEFAULT: { label: 'Дефолт', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  CANCELLED: { label: 'Отменена', color: 'bg-muted text-muted-foreground border-border' },
}

const LEDGER_TYPE_LABELS: Record<string, string> = {
  disbursement: 'Выдача',
  repayment_principal: 'Погашение тела',
  repayment_interest: 'Погашение %',
  fee: 'Комиссия',
  penalty_manual: 'Штраф',
  adjustment: 'Корректировка',
  offset: 'Взаимозачёт',
  collateral_sale_proceeds: 'Продажа залога',
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PLANNED: { label: 'Плановый', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  PAID: { label: 'Оплачен', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  OVERDUE: { label: 'Просрочен', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  ADJUSTED: { label: 'Скорректирован', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
}

function formatMoney(amount: number | null | undefined, currency?: string) {
  if (amount == null) return '-'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + (currency ? ` ${currency}` : '')
}

export default function FinanceDealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const dealId = params.id as string

  const [deal, setDeal] = useState<CoreDeal | null>(null)
  const [financeDeal, setFinanceDeal] = useState<FinanceDeal | null>(null)
  const [ledger, setLedger] = useState<FinanceLedgerEntry[]>([])
  const [schedule, setSchedule] = useState<FinancePaymentScheduleItem[]>([])
  const [participants, setParticipants] = useState<FinanceParticipant[]>([])
  const [collaterals, setCollaterals] = useState<FinanceCollateralLink[]>([])
  const [pauses, setPauses] = useState<FinancePausePeriod[]>([])
  const [loading, setLoading] = useState(true)

  // Справочники
  const [contacts, setContacts] = useState<Contact[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assets, setAssets] = useState<Asset[]>([])

  // Диалоги
  const [isLedgerOpen, setIsLedgerOpen] = useState(false)
  const [isParticipantOpen, setIsParticipantOpen] = useState(false)
  const [isCollateralOpen, setIsCollateralOpen] = useState(false)
  const [isPauseOpen, setIsPauseOpen] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'schedule' | 'participants' | 'collateral'>('overview')

  // Формы
  const [ledgerForm, setLedgerForm] = useState({ entry_type: 'repayment_principal' as string, amount: '', currency: 'USD', note: '' })
  const [participantForm, setParticipantForm] = useState({ contact_id: '', employee_id: '', participant_role: 'borrower', note: '' })
  const [collateralForm, setCollateralForm] = useState({ asset_id: '', note: '' })
  const [pauseForm, setPauseForm] = useState({ start_date: new Date().toISOString().slice(0, 10), end_date: '', reason: '' })

  const loadDeal = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('core_deals')
        .select(`*, contact:contacts(*), responsible_employee:employees(*)`)
        .eq('id', dealId)
        .single()
      if (error) throw error
      setDeal(data as CoreDeal)

      // Финансовая часть
      const { data: fd } = await supabase
        .from('finance_deals')
        .select('*')
        .eq('core_deal_id', dealId)
        .single()
      if (fd) {
        setFinanceDeal(fd as FinanceDeal)

        // Параллельная загрузка
        const [ledgerRes, scheduleRes, partRes, collRes, pausesRes] = await Promise.all([
          supabase.from('finance_ledger').select('*').eq('finance_deal_id', fd.id).order('occurred_at', { ascending: false }),
          supabase.from('finance_payment_schedule').select('*').eq('finance_deal_id', fd.id).order('due_date'),
          supabase.from('finance_participants').select('*, contact:contacts(*), employee:employees(*)').eq('finance_deal_id', fd.id),
          supabase.from('finance_collateral_links').select('*, asset:assets(*)').eq('finance_deal_id', fd.id),
          supabase.from('finance_pause_periods').select('*').eq('finance_deal_id', fd.id).order('start_date'),
        ])
        setLedger((ledgerRes.data || []) as FinanceLedgerEntry[])
        setSchedule((scheduleRes.data || []) as FinancePaymentScheduleItem[])
        setParticipants((partRes.data || []) as FinanceParticipant[])
        setCollaterals((collRes.data || []) as FinanceCollateralLink[])
        setPauses((pausesRes.data || []) as FinancePausePeriod[])
      }
    } catch {
      toast.error('Ошибка загрузки сделки')
    } finally {
      setLoading(false)
    }
  }, [supabase, dealId])

  const loadRefs = useCallback(async () => {
    const [c, e, a] = await Promise.all([
      supabase.from('contacts').select('id, full_name').order('full_name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('assets').select('id, title, asset_type, status').order('created_at', { ascending: false }),
    ])
    setContacts((c.data || []) as Contact[])
    setEmployees((e.data || []) as Employee[])
    setAssets((a.data || []) as Asset[])
  }, [supabase])

  useEffect(() => { loadDeal(); loadRefs() }, [loadDeal, loadRefs])

  const updateStatus = async (status: CoreDealStatus) => {
    try {
      const { error } = await supabase.from('core_deals').update({ status }).eq('id', dealId)
      if (error) throw error
      toast.success(`Статус изменён на "${STATUS_MAP[status]?.label}"`)
      loadDeal()
    } catch { toast.error('Ошибка смены статуса') }
  }

  const addLedgerEntry = async () => {
    if (!financeDeal || !ledgerForm.amount) return
    try {
      const amount = parseFloat(ledgerForm.amount)
      const { error } = await supabase.from('finance_ledger').insert({
        finance_deal_id: financeDeal.id,
        entry_type: ledgerForm.entry_type,
        amount, currency: ledgerForm.currency,
        base_amount: amount, base_currency: ledgerForm.currency,
        note: ledgerForm.note || null,
      })
      if (error) throw error
      toast.success('Запись добавлена в книгу')
      setIsLedgerOpen(false)
      setLedgerForm({ entry_type: 'repayment_principal', amount: '', currency: 'USD', note: '' })
      loadDeal()
    } catch { toast.error('Ошибка добавления записи') }
  }

  const addParticipant = async () => {
    if (!financeDeal || (!participantForm.contact_id && !participantForm.employee_id)) return
    try {
      const { error } = await supabase.from('finance_participants').insert({
        finance_deal_id: financeDeal.id,
        contact_id: participantForm.contact_id || null,
        employee_id: participantForm.employee_id || null,
        participant_role: participantForm.participant_role,
        note: participantForm.note || null,
      })
      if (error) throw error
      toast.success('Участник добавлен')
      setIsParticipantOpen(false)
      setParticipantForm({ contact_id: '', employee_id: '', participant_role: 'borrower', note: '' })
      loadDeal()
    } catch { toast.error('Ошибка добавления участника') }
  }

  const linkCollateral = async () => {
    if (!financeDeal || !collateralForm.asset_id) return
    try {
      const { error } = await supabase.from('finance_collateral_links').insert({
        finance_deal_id: financeDeal.id,
        asset_id: collateralForm.asset_id,
        status: 'active',
        note: collateralForm.note || null,
      })
      if (error) throw error
      toast.success('Залог привязан')
      setIsCollateralOpen(false)
      setCollateralForm({ asset_id: '', note: '' })
      loadDeal()
    } catch { toast.error('Ошибка привязки залога') }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка...</div>
  if (!deal) return <div className="flex items-center justify-center py-20 text-muted-foreground">Сделка не найдена</div>

  const st = STATUS_MAP[deal.status as CoreDealStatus] || { label: deal.status, color: '' }

  // Балансы по книге (через pure function)
  const balances = computeBalances(
    financeDeal?.principal_amount || 0,
    ledger.map(l => ({ entry_type: l.entry_type, amount: l.amount || 0 })),
  )
  const pausedDaysCount = totalPausedDays(
    pauses.map(p => ({ startDate: p.start_date, endDate: p.end_date })),
  )
  const today = new Date().toISOString().slice(0, 10)
  const activePause = pauses.find(p => p.start_date <= today && p.end_date >= today)

  const tabs = [
    { id: 'overview', label: 'Обзор', icon: Landmark },
    { id: 'ledger', label: 'Книга', icon: History },
    { id: 'schedule', label: 'График', icon: Calendar },
    { id: 'participants', label: 'Участники', icon: Users },
    { id: 'collateral', label: 'Залоги', icon: Package },
  ] as const

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance-deals">
            <Button variant="ghost" size="icon" className="bg-transparent"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{deal.title}</h1>
              <Badge variant="outline" className={st.color}>{st.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {(deal.contact as any)?.full_name || 'Без контакта'} 
              {financeDeal && ` \u2022 ${formatMoney(financeDeal.principal_amount, financeDeal.contract_currency)} \u2022 ${financeDeal.term_months} мес. \u2022 ${financeDeal.rate_percent}%`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {deal.status === 'NEW' && <Button size="sm" onClick={() => updateStatus('ACTIVE')}>Активировать</Button>}
          {deal.status === 'ACTIVE' && (
            <>
              <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setIsPauseOpen(true)}><Pause className="h-4 w-4 mr-1" />Пауза</Button>
              <Button size="sm" variant="outline" className="bg-transparent text-red-400 border-red-500/30" onClick={() => updateStatus('DEFAULT')}>Дефолт</Button>
              <Button size="sm" onClick={() => updateStatus('CLOSED')}>Закрыть</Button>
            </>
          )}
          {deal.status === 'PAUSED' && activePause && financeDeal && (
            <Button size="sm" onClick={async () => {
              const result = await resumeDeal({ coreDealId: dealId, financeDealId: financeDeal.id, pauseId: activePause.id })
              if (result.success) { toast.success(result.message); loadDeal() }
              else toast.error(result.error)
            }}><Play className="h-4 w-4 mr-1" />Возобновить</Button>
          )}
          {deal.status === 'PAUSED' && !activePause && <Button size="sm" onClick={() => updateStatus('ACTIVE')}><Play className="h-4 w-4 mr-1" />Возобновить</Button>}
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Выдано</p>
            <p className="text-lg font-bold font-mono">{formatMoney(balances.totalDisbursed, financeDeal?.contract_currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Тело погашено</p>
            <p className="text-lg font-bold font-mono text-emerald-400">{formatMoney(balances.principalRepaid, financeDeal?.contract_currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">% погашено</p>
            <p className="text-lg font-bold font-mono text-emerald-400">{formatMoney(balances.interestRepaid, financeDeal?.contract_currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Остаток тела</p>
            <p className={`text-lg font-bold font-mono ${balances.outstandingPrincipal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatMoney(balances.outstandingPrincipal, financeDeal?.contract_currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Пауза / Залоги</p>
            <p className="text-lg font-bold">
              {pausedDaysCount > 0 ? <span className="text-amber-400">{pausedDaysCount} дн.</span> : '0 дн.'}
              {' / '}
              {collaterals.filter(c => c.status === 'active').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Табы */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          )
        })}
      </div>

      {/* Обзор */}
      {activeTab === 'overview' && (
        <>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Параметры сделки</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Тело</span><span className="text-sm font-mono">{formatMoney(financeDeal?.principal_amount, financeDeal?.contract_currency)}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Срок</span><span className="text-sm">{financeDeal?.term_months} мес.</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Ставка</span><span className="text-sm">{financeDeal?.rate_percent}%</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Тип графика</span><span className="text-sm">{financeDeal?.schedule_type}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Ответственный</span><span className="text-sm">{(deal.responsible_employee as any)?.full_name || '-'}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Создана</span><span className="text-sm">{new Date(deal.created_at).toLocaleDateString('ru-RU')}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Последние записи книги</CardTitle></CardHeader>
            <CardContent>
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет записей</p>
              ) : ledger.slice(0, 5).map(entry => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm">{LEDGER_TYPE_LABELS[entry.entry_type] || entry.entry_type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.occurred_at).toLocaleDateString('ru-RU')}</p>
                  </div>
                  <span className={`text-sm font-mono ${entry.entry_type === 'disbursement' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {entry.entry_type === 'disbursement' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Периоды паузы */}
        {pauses.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Периоды паузы ({pauses.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Начало</TableHead>
                    <TableHead>Конец</TableHead>
                    <TableHead>Причина</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pauses.map(p => {
                    const isActive = p.start_date <= today && p.end_date >= today
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{new Date(p.start_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell className="text-sm">{new Date(p.end_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.reason || '-'}
                          {isActive && <Badge variant="outline" className="ml-2 bg-amber-500/15 text-amber-400 border-amber-500/30">Активна</Badge>}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 bg-transparent"
                            onClick={async () => {
                              if (!financeDeal) return
                              const result = await deletePause({ coreDealId: dealId, financeDealId: financeDeal.id, pauseId: p.id })
                              if (result.success) { toast.success(result.message); loadDeal() }
                              else toast.error(result.error)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        </>
      )}

      {/* Книга (Ledger) */}
      {activeTab === 'ledger' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Книга операций</CardTitle>
            <Button size="sm" onClick={() => setIsLedgerOpen(true)}><Plus className="h-4 w-4 mr-1" />Запись</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Примечание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Нет записей</TableCell></TableRow>
                ) : ledger.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{new Date(entry.occurred_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    <TableCell><Badge variant="outline">{LEDGER_TYPE_LABELS[entry.entry_type] || entry.entry_type}</Badge></TableCell>
                    <TableCell className={`font-mono ${entry.entry_type === 'disbursement' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {entry.entry_type === 'disbursement' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* График платежей */}
      {activeTab === 'schedule' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">График платежей</CardTitle>
            {financeDeal && financeDeal.schedule_type !== 'manual' && financeDeal.schedule_type !== 'tranches' && (
              <Button
                size="sm"
                variant="outline"
                className="bg-transparent"
                disabled={isRecalculating}
                onClick={async () => {
                  setIsRecalculating(true)
                  const result = await regenerateSchedule(financeDeal.id)
                  if (result.success) { toast.success(result.message); loadDeal() }
                  else toast.error(result.error)
                  setIsRecalculating(false)
                }}
              >
                <Calendar className="h-4 w-4 mr-1" />{isRecalculating ? 'Пересчёт...' : 'Пересчитать'}
              </Button>
            )}
          </CardHeader>
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
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">График ещё не сформирован</TableCell></TableRow>
                ) : schedule.map(item => {
                  const pst = PAYMENT_STATUS_MAP[item.status] || { label: item.status, color: '' }
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{new Date(item.due_date).toLocaleDateString('ru-RU')}</TableCell>
                      <TableCell className="font-mono text-sm">{formatMoney(item.principal_due, item.currency)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatMoney(item.interest_due, item.currency)}</TableCell>
                      <TableCell className="font-mono text-sm font-medium">{formatMoney(item.total_due, item.currency)}</TableCell>
                      <TableCell><Badge variant="outline" className={pst.color}>{pst.label}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Участники */}
      {activeTab === 'participants' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Участники сделки</CardTitle>
            <Button size="sm" onClick={() => setIsParticipantOpen(true)}><UserPlus className="h-4 w-4 mr-1" />Добавить</Button>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет участников</p>
            ) : (
              <div className="space-y-3">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {(p.contact as any)?.full_name || (p.employee as any)?.full_name || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">{p.participant_role}{p.is_primary ? ' (основной)' : ''}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 bg-transparent"
                      onClick={async () => {
                        await supabase.from('finance_participants').delete().eq('id', p.id)
                        toast.success('Участник удалён')
                        loadDeal()
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Залоги */}
      {activeTab === 'collateral' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Залоговое имущество</CardTitle>
            <Button size="sm" onClick={() => setIsCollateralOpen(true)}><Link2 className="h-4 w-4 mr-1" />Привязать</Button>
          </CardHeader>
          <CardContent>
            {collaterals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет привязанных залогов</p>
            ) : (
              <div className="space-y-3">
                {collaterals.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <Link href={`/assets/${(c.asset as any)?.id}`} className="text-sm font-medium hover:underline">
                          {(c.asset as any)?.title || 'Актив'}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {(c.asset as any)?.asset_type} 
                          {c.note && ` \u2022 ${c.note}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={c.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}>
                      {c.status === 'active' ? 'Активен' : c.status === 'released' ? 'Освобождён' : c.status === 'foreclosed' ? 'Обращён' : c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Диалог добавления записи в книгу */}
      <Dialog open={isLedgerOpen} onOpenChange={setIsLedgerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая запись в книгу</DialogTitle>
            <DialogDescription>Добавьте операцию по финансовой сделке</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип операции</Label>
              <Select value={ledgerForm.entry_type} onValueChange={v => setLedgerForm(f => ({ ...f, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEDGER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Сумма</Label>
                <Input type="number" value={ledgerForm.amount} onChange={e => setLedgerForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={ledgerForm.currency} onValueChange={v => setLedgerForm(f => ({ ...f, currency: v }))}>
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
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea value={ledgerForm.note} onChange={e => setLedgerForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLedgerOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={addLedgerEntry}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог участника */}
      <Dialog open={isParticipantOpen} onOpenChange={setIsParticipantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить участника</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={participantForm.participant_role} onValueChange={v => setParticipantForm(f => ({ ...f, participant_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower">Заёмщик</SelectItem>
                  <SelectItem value="lender">Кредитор</SelectItem>
                  <SelectItem value="guarantor">Поручитель</SelectItem>
                  <SelectItem value="co_borrower">Созаёмщик</SelectItem>
                  <SelectItem value="agent">Агент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Контакт</Label>
              <Select value={participantForm.contact_id} onValueChange={v => setParticipantForm(f => ({ ...f, contact_id: v, employee_id: '' }))}>
                <SelectTrigger><SelectValue placeholder="Выберите контакт" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Или сотрудник</Label>
              <Select value={participantForm.employee_id} onValueChange={v => setParticipantForm(f => ({ ...f, employee_id: v, contact_id: '' }))}>
                <SelectTrigger><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input value={participantForm.note} onChange={e => setParticipantForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsParticipantOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={addParticipant}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог паузы */}
      <Dialog open={isPauseOpen} onOpenChange={setIsPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поставить сделку на паузу</DialogTitle>
            <DialogDescription>Укажите период и причину. График будет пересчитан автоматически.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Дата начала</Label>
                <Input type="date" value={pauseForm.start_date} onChange={e => setPauseForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Дата окончания</Label>
                <Input type="date" value={pauseForm.end_date} onChange={e => setPauseForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Причина</Label>
              <Textarea value={pauseForm.reason} onChange={e => setPauseForm(f => ({ ...f, reason: e.target.value }))} placeholder="Необязательно" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPauseOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={async () => {
              if (!financeDeal || !pauseForm.end_date) {
                toast.error('Укажите дату окончания')
                return
              }
              const result = await pauseDeal({
                coreDealId: dealId,
                financeDealId: financeDeal.id,
                startDate: pauseForm.start_date,
                endDate: pauseForm.end_date,
                reason: pauseForm.reason || undefined,
              })
              if (result.success) {
                toast.success(result.message)
                setIsPauseOpen(false)
                setPauseForm({ start_date: new Date().toISOString().slice(0, 10), end_date: '', reason: '' })
                loadDeal()
              } else {
                toast.error(result.error)
              }
            }}>Поставить на паузу</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог залога */}
      <Dialog open={isCollateralOpen} onOpenChange={setIsCollateralOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Привязать залог</DialogTitle>
            <DialogDescription>Выберите актив из модуля имущества</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Актив</Label>
              <Select value={collateralForm.asset_id} onValueChange={v => setCollateralForm(f => ({ ...f, asset_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите актив" /></SelectTrigger>
                <SelectContent>
                  {assets.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title} ({a.asset_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input value={collateralForm.note} onChange={e => setCollateralForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCollateralOpen(false)} className="bg-transparent">Отмена</Button>
            <Button onClick={linkCollateral}>Привязать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
