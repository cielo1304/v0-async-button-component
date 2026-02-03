'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Deal, DealPayment, Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  Briefcase, ArrowLeft, Phone, Mail, Car as CarIcon, 
  DollarSign, CreditCard, Calendar, User, FileText,
  Loader2, Plus, CheckCircle, AlertCircle, Clock
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AddPaymentDialog } from '@/components/deals/add-payment-dialog'
import { PaymentDetailDialog } from '@/components/deals/payment-detail-dialog'

interface DealWithDetails extends Deal {
  cars?: Car | null
}

interface PaymentWithCashbox extends DealPayment {
  cashboxes?: { name: string; currency: string } | null
}

const STATUS_MAP: Record<string, 'active' | 'pending' | 'success' | 'closed' | 'error'> = {
  'NEW': 'active',
  'IN_PROGRESS': 'active',
  'PENDING_PAYMENT': 'pending',
  'PAID': 'success',
  'COMPLETED': 'success',
  'CANCELLED': 'error',
}

const STATUS_LABELS: Record<string, string> = {
  'NEW': 'Новая',
  'IN_PROGRESS': 'В работе',
  'PENDING_PAYMENT': 'Ожидает оплаты',
  'PAID': 'Оплачено',
  'COMPLETED': 'Завершена',
  'CANCELLED': 'Отменена',
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  'PREPAYMENT': 'Предоплата',
  'PARTIAL': 'Частичная оплата',
  'FINAL': 'Финальная оплата',
  'REFUND': 'Возврат',
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [deal, setDeal] = useState<DealWithDetails | null>(null)
  const [payments, setPayments] = useState<PaymentWithCashbox[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithCashbox | null>(null)
  const [showPaymentDetail, setShowPaymentDetail] = useState(false)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    try {
      // Загружаем сделку с авто
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .select(`
          *,
          cars (*)
        `)
        .eq('id', params.id)
        .single()

      if (dealError) throw dealError
      setDeal(dealData)

      // Загружаем платежи
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('deal_payments')
        .select(`
          *,
          cashboxes (name, currency)
        `)
        .eq('deal_id', params.id)
        .order('created_at', { ascending: false })

      if (paymentsError) throw paymentsError
      setPayments(paymentsData || [])
    } catch (error) {
      console.error('[v0] Error loading deal:', error)
    } finally {
      setIsLoading(false)
    }
  }, [params.id, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Сделка не найдена</p>
        <Button variant="outline" onClick={() => router.push('/deals')}>
          Вернуться к списку
        </Button>
      </div>
    )
  }

  // Расчеты
  const totalUsd = deal.total_currency === 'USD' 
    ? Number(deal.total_amount) 
    : Number(deal.total_amount) / 92.5
  const paidUsd = Number(deal.paid_amount_usd)
  const debtUsd = totalUsd - paidUsd
  const paidPercent = totalUsd > 0 ? (paidUsd / totalUsd) * 100 : 0
  const car = deal.cars; // Declare the car variable

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/deals">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Briefcase className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground font-mono">
                      {deal.deal_number}
                    </h1>
                    <StatusBadge status={STATUS_MAP[deal.status] || 'active'} />
                  </div>
                  <p className="text-sm text-muted-foreground">{STATUS_LABELS[deal.status]}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AddPaymentDialog dealId={deal.id} onSuccess={loadData} />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка - Информация */}
          <div className="lg:col-span-2 space-y-6">
            {/* Клиент */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Клиент
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ФИО</span>
                  <span className="font-medium text-foreground">{deal.client_name}</span>
                </div>
                {deal.client_phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Phone className="h-4 w-4" /> Телефон
                    </span>
                    <a href={`tel:${deal.client_phone}`} className="font-medium text-foreground hover:text-amber-400">
                      {deal.client_phone}
                    </a>
                  </div>
                )}
                {deal.client_email && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email
                    </span>
                    <a href={`mailto:${deal.client_email}`} className="font-medium text-foreground hover:text-amber-400">
                      {deal.client_email}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Автомобиль */}
            {deal.cars && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <CarIcon className="h-5 w-5" />
                    Автомобиль
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link 
                    href={`/cars/${deal.car_id}`}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-foreground text-lg">
                        {deal.cars.brand} {deal.cars.model}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {deal.cars.year} • {deal.cars.color || 'Цвет не указан'}
                      </div>
                      {deal.cars.vin && (
                        <div className="text-xs font-mono text-muted-foreground mt-1">
                          VIN: {deal.cars.vin}
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary">{deal.cars.status}</Badge>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Платежи */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Платежи
                </CardTitle>
                <Badge variant="outline" className="font-mono">
                  {payments.length} платежей
                </Badge>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Платежей пока нет</p>
                    <p className="text-sm">Добавьте первый платеж по сделке</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedPayment(payment)
                          setShowPaymentDetail(true)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${
                            payment.payment_type === 'REFUND' 
                              ? 'bg-red-500/10 text-red-400' 
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {payment.payment_type === 'REFUND' ? (
                              <AlertCircle className="h-4 w-4" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {payment.cashboxes?.name || 'Касса не указана'} • {format(new Date(payment.created_at), 'dd MMM yyyy HH:mm', { locale: ru })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-semibold ${
                            payment.payment_type === 'REFUND' ? 'text-red-400' : 'text-emerald-400'
                          }`}>
                            {payment.payment_type === 'REFUND' ? '-' : '+'}
                            {Number(payment.amount).toLocaleString('ru-RU')} {payment.currency}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            ${Number(payment.amount_usd).toLocaleString('en-US')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Заметки */}
            {deal.notes && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Заметки
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Правая колонка - Финансы */}
          <div className="space-y-6">
            {/* Финансовая сводка */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Финансы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Сумма контракта</span>
                  <div className="text-right">
                    <div className="font-mono font-bold text-xl text-foreground">
                      {Number(deal.total_amount).toLocaleString('ru-RU')}
                    </div>
                    <div className="text-xs text-muted-foreground">{deal.total_currency}</div>
                  </div>
                </div>

                {deal.total_currency !== 'USD' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">В USD (примерно)</span>
                    <span className="font-mono text-muted-foreground">
                      ${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Оплачено</span>
                    <div className="text-right">
                      <div className="font-mono font-bold text-lg text-emerald-400">
                        ${paidUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs text-muted-foreground">{paidPercent.toFixed(0)}%</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Остаток долга</span>
                  <div className={`font-mono font-bold text-lg ${debtUsd > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    ${debtUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                {/* Прогресс бар */}
                <div className="mt-4">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(paidPercent, 100)}%` }}
                    />
                  </div>
                </div>

                {deal.margin_amount !== null && deal.margin_amount !== undefined && (
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Прибыль (маржа)</span>
                      <span className={`font-mono font-bold text-lg ${Number(deal.margin_amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(deal.margin_amount) >= 0 ? '+' : ''}{Number(deal.margin_amount).toLocaleString('ru-RU')} {deal.total_currency}
                      </span>
                    </div>
                    {car && (
                      <p className="text-xs text-muted-foreground mt-1">
                        = контракт ({Number(deal.total_amount).toLocaleString()}) - себестоимость ({Number(car.cost_price).toLocaleString()})
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Даты */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Даты
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Создана</span>
                  <span className="text-sm text-foreground">
                    {format(new Date(deal.created_at), 'dd MMMM yyyy HH:mm', { locale: ru })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Обновлена</span>
                  <span className="text-sm text-foreground">
                    {format(new Date(deal.updated_at), 'dd MMMM yyyy HH:mm', { locale: ru })}
                  </span>
                </div>
                {deal.closed_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Закрыта</span>
                    <span className="text-sm text-foreground">
                      {format(new Date(deal.closed_at), 'dd MMMM yyyy HH:mm', { locale: ru })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ID */}
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground font-mono break-all">
                  ID: {deal.id}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Диалог деталей платежа */}
      {selectedPayment && showPaymentDetail && (
        <PaymentDetailDialog
          payment={selectedPayment}
          open={showPaymentDetail}
          onOpenChange={setShowPaymentDetail}
        />
      )}
    </div>
  )
}
