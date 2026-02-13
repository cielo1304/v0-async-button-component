'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Progress } from '@/components/ui/progress'
import { AutoDeal, AutoPayment, AutoPenalty, AutoClient, Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  Loader2, FileText, Car as CarIcon, User, CreditCard, Calendar,
  AlertTriangle, CheckCircle, Clock, DollarSign, Percent
} from 'lucide-react'
import { format, differenceInDays, isPast } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AddPaymentDialog } from '@/components/auto-platform/add-payment-dialog'

const DEAL_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  CASH_SALE: { label: 'Наличная продажа', color: 'bg-emerald-500/20 text-emerald-400' },
  COMMISSION_SALE: { label: 'Комиссионная продажа', color: 'bg-blue-500/20 text-blue-400' },
  INSTALLMENT: { label: 'Рассрочка', color: 'bg-amber-500/20 text-amber-400' },
  RENT: { label: 'Аренда', color: 'bg-violet-500/20 text-violet-400' },
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  NEW: { label: 'Новая', variant: 'default' },
  IN_PROGRESS: { label: 'В работе', variant: 'info' },
  COMPLETED: { label: 'Завершена', variant: 'success' },
  CANCELLED: { label: 'Отменена', variant: 'error' },
  OVERDUE: { label: 'Просрочена', variant: 'warning' },
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Ожидает', color: 'text-muted-foreground' },
  PARTIAL: { label: 'Частично', color: 'text-amber-400' },
  PAID: { label: 'Оплачен', color: 'text-emerald-400' },
  OVERDUE: { label: 'Просрочен', color: 'text-red-400' },
}

type DealWithRelations = AutoDeal & {
  buyer?: AutoClient | null
  seller?: AutoClient | null
  car?: Car | null
}

export default function AutoDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deal, setDeal] = useState<DealWithRelations | null>(null)
  const [payments, setPayments] = useState<AutoPayment[]>([])
  const [penalties, setPenalties] = useState<AutoPenalty[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const loadData = async () => {
    try {
      // Загружаем сделку
      const { data: dealData, error: dealError } = await supabase
        .from('auto_deals')
        .select(`
          *,
          buyer:auto_clients!auto_deals_buyer_id_fkey(*),
          seller:auto_clients!auto_deals_seller_id_fkey(*),
          car:cars(*)
        `)
        .eq('id', id)
        .single()

      if (dealError) throw dealError
      setDeal(dealData)

      // Загружаем платежи
      const { data: paymentsData } = await supabase
        .from('auto_payments')
        .select('*')
        .eq('deal_id', id)
        .order('payment_number')

      setPayments(paymentsData || [])

      // Загружаем штрафы
      const { data: penaltiesData } = await supabase
        .from('auto_penalties')
        .select('*')
        .eq('deal_id', id)
        .order('created_at', { ascending: false })

      setPenalties(penaltiesData || [])
    } catch (error) {
      console.error('[v0] Error loading deal:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Сделка не найдена</p>
      </div>
    )
  }

  const typeConfig = DEAL_TYPE_CONFIG[deal.deal_type]
  const statusConfig = STATUS_CONFIG[deal.status]

  // Расчеты
  const totalAmount = deal.deal_type === 'RENT' 
    ? (Number(deal.rent_price_daily || 0) * (deal.rent_start_date && deal.rent_end_date 
        ? differenceInDays(new Date(deal.rent_end_date), new Date(deal.rent_start_date)) 
        : 0)) + Number(deal.deposit_amount || 0)
    : Number(deal.sale_price || 0)

  const totalPaid = Number(deal.total_paid || 0)
  const totalDebt = Number(deal.total_debt || 0)
  const progressPercent = totalAmount > 0 ? Math.min((totalPaid / totalAmount) * 100, 100) : 0

  // Просроченные платежи
  const overduePayments = payments.filter(p => 
    p.status !== 'PAID' && isPast(new Date(p.due_date))
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/cars">
                <Button variant="ghost" size="sm">{'← К списку'}</Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800">
                  <FileText className="h-5 w-5 text-zinc-100" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground font-mono">{deal.deal_number}</h1>
                    <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                    <StatusBadge status={statusConfig.label} variant={statusConfig.variant} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    от {format(new Date(deal.contract_date), 'd MMMM yyyy', { locale: ru })}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AddPaymentDialog dealId={deal.id} currency={deal.sale_currency} onSuccess={loadData} />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка */}
          <div className="lg:col-span-2 space-y-6">
            {/* Предупреждение о просрочке */}
            {overduePayments.length > 0 && (
              <Card className="border-red-500/50 bg-red-500/10">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <div>
                      <p className="font-medium text-red-400">
                        Просрочено платежей: {overduePayments.length}
                      </p>
                      <p className="text-sm text-red-400/80">
                        Общая сумма: {overduePayments.reduce((sum, p) => sum + (Number(p.amount) - Number(p.paid_amount)), 0).toLocaleString()} {deal.sale_currency}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Автомобиль */}
            {deal.car && (
              <Link href={`/cars/${deal.car.id}`}>
                <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CarIcon className="h-5 w-5" />
                      Автомобиль
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-secondary">
                        <CarIcon className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="text-xl font-bold">{deal.car.brand} {deal.car.model}</p>
                        <p className="text-muted-foreground">{deal.car.year} • {deal.car.vin || 'VIN не указан'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* Клиенты */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deal.buyer && (
                <Link href={`/cars/clients/${deal.buyer.id}`}>
                  <Card className="hover:bg-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        {deal.deal_type === 'RENT' ? 'Арендатор' : 'Покупатель'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="font-medium">{deal.buyer.full_name}</p>
                          {deal.buyer.phone && <p className="text-sm text-muted-foreground">{deal.buyer.phone}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}

              {deal.seller && (
                <Link href={`/cars/clients/${deal.seller.id}`}>
                  <Card className="hover:bg-secondary/50 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Комитент</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-blue-400" />
                        <div>
                          <p className="font-medium">{deal.seller.full_name}</p>
                          {deal.seller.phone && <p className="text-sm text-muted-foreground">{deal.seller.phone}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>

            {/* График платежей */}
            {payments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    График платежей ({payments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {payments.map((payment) => {
                      const isOverdue = payment.status !== 'PAID' && isPast(new Date(payment.due_date))
                      const statusInfo = PAYMENT_STATUS_CONFIG[isOverdue ? 'OVERDUE' : payment.status]
                      
                      return (
                        <div
                          key={payment.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isOverdue ? 'border-red-500/50 bg-red-500/10' : 'border-border bg-secondary/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {payment.status === 'PAID' ? (
                              <CheckCircle className="h-5 w-5 text-emerald-400" />
                            ) : isOverdue ? (
                              <AlertTriangle className="h-5 w-5 text-red-400" />
                            ) : (
                              <Clock className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium">Платеж #{payment.payment_number}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(payment.due_date), 'd MMM yyyy', { locale: ru })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-bold">
                              {Number(payment.amount).toLocaleString()} {payment.currency}
                            </p>
                            <p className={`text-sm ${statusInfo.color}`}>
                              {payment.status === 'PAID' 
                                ? `Оплачен ${payment.paid_date ? format(new Date(payment.paid_date), 'd.MM.yy', { locale: ru }) : ''}`
                                : payment.paid_amount > 0 
                                  ? `Оплачено ${Number(payment.paid_amount).toLocaleString()}`
                                  : statusInfo.label
                              }
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Штрафы */}
            {penalties.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="h-5 w-5" />
                    Штрафы и пени ({penalties.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {penalties.map((penalty) => (
                      <div
                        key={penalty.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/10"
                      >
                        <div>
                          <p className="font-medium">
                            {penalty.penalty_type === 'LATE_PAYMENT' && 'Просрочка платежа'}
                            {penalty.penalty_type === 'DAMAGE' && 'Повреждение'}
                            {penalty.penalty_type === 'EARLY_RETURN' && 'Досрочный возврат'}
                            {penalty.penalty_type === 'OTHER' && 'Прочее'}
                          </p>
                          {penalty.description && (
                            <p className="text-sm text-muted-foreground">{penalty.description}</p>
                          )}
                          {penalty.days_overdue && (
                            <p className="text-sm text-muted-foreground">
                              Дней просрочки: {penalty.days_overdue}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-amber-400">
                            {Number(penalty.amount).toLocaleString()} {penalty.currency}
                          </p>
                          <p className={`text-sm ${penalty.is_paid ? 'text-emerald-400' : 'text-red-400'}`}>
                            {penalty.is_paid ? 'Оплачен' : 'Не оплачен'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Правая колонка - финансы */}
          <div className="space-y-6">
            {/* Финансовая сводка */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Финансы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Прогресс оплаты */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Оплачено</span>
                    <span className="font-mono">{progressPercent.toFixed(0)}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>

                {/* Суммы */}
                <div className="space-y-3 pt-2">
                  {deal.deal_type === 'RENT' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Цена/день</span>
                        <span className="font-mono">{Number(deal.rent_price_daily).toLocaleString()} {deal.sale_currency}</span>
                      </div>
                      {deal.deposit_amount && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Депозит</span>
                          <span className="font-mono">{Number(deal.deposit_amount).toLocaleString()} {deal.sale_currency}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Цена продажи</span>
                      <span className="font-mono font-bold">{Number(deal.sale_price).toLocaleString()} {deal.sale_currency}</span>
                    </div>
                  )}

                  {deal.deal_type === 'COMMISSION_SALE' && deal.commission_amount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        Комиссия ({deal.commission_percent}%)
                      </span>
                      <span className="font-mono text-emerald-400">
                        +{Number(deal.commission_amount).toLocaleString()} {deal.sale_currency}
                      </span>
                    </div>
                  )}

                  {deal.deal_type === 'INSTALLMENT' && deal.down_payment && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Первоначальный взнос</span>
                      <span className="font-mono">{Number(deal.down_payment).toLocaleString()} {deal.sale_currency}</span>
                    </div>
                  )}

                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Оплачено</span>
                      <span className="font-mono text-emerald-400">{totalPaid.toLocaleString()} {deal.sale_currency}</span>
                    </div>
                  </div>

                  {totalDebt > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Остаток долга</span>
                      <span className="font-mono text-red-400">{totalDebt.toLocaleString()} {deal.sale_currency}</span>
                    </div>
                  )}

                  {/* P&L Section */}
                  {deal.profit_total != null && (
                    <>
                      <div className="border-t border-border pt-3 mt-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Прибыль (всего)</span>
                          <span className={`font-mono font-bold ${Number(deal.profit_total) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(deal.profit_total).toLocaleString()} {deal.sale_currency}
                          </span>
                        </div>
                      </div>

                      {deal.deal_type === 'INSTALLMENT' && deal.profit_available != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Прибыль (доступная)</span>
                          <span className={`font-mono ${Number(deal.profit_available) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(deal.profit_available).toLocaleString()} {deal.sale_currency}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Рассрочка - детали */}
            {deal.deal_type === 'INSTALLMENT' && (
              <Card>
                <CardHeader>
                  <CardTitle>Условия рассрочки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Срок</span>
                    <span>{deal.installment_months} месяцев</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ставка</span>
                    <span>{deal.interest_rate}% годовых</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ежемесячный платеж</span>
                    <span className="font-mono font-bold">{Number(deal.monthly_payment).toLocaleString()} {deal.sale_currency}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Аренда - даты */}
            {deal.deal_type === 'RENT' && deal.rent_start_date && (
              <Card>
                <CardHeader>
                  <CardTitle>Период аренды</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Начало</span>
                    <span>{format(new Date(deal.rent_start_date), 'd MMMM yyyy', { locale: ru })}</span>
                  </div>
                  {deal.rent_end_date && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Окончание</span>
                      <span>{format(new Date(deal.rent_end_date), 'd MMMM yyyy', { locale: ru })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Дней</span>
                    <span className="font-bold">
                      {differenceInDays(new Date(deal.rent_end_date || new Date()), new Date(deal.rent_start_date))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Даты */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Создана</span>
                  <span>{format(new Date(deal.created_at), 'd MMM yyyy HH:mm', { locale: ru })}</span>
                </div>
                {deal.completion_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Завершена</span>
                    <span>{format(new Date(deal.completion_date), 'd MMM yyyy', { locale: ru })}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Примечание */}
            {deal.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Примечание</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{deal.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
