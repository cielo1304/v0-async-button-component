'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DealPayment } from '@/lib/types/database'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CreditCard, Wallet, Calendar, FileText, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'

interface PaymentDetailDialogProps {
  payment: DealPayment & {
    cashboxes?: {
      id: string
      name: string
      currency: string
    }
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  RUB: '₽',
  EUR: '€',
  USDT: '₮',
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  PREPAYMENT: 'Предоплата',
  PARTIAL: 'Частичная оплата',
  FINAL: 'Финальная оплата',
  REFUND: 'Возврат',
}

export function PaymentDetailDialog({
  payment,
  open,
  onOpenChange,
}: PaymentDetailDialogProps) {
  const symbol = CURRENCY_SYMBOLS[payment.currency] || payment.currency

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <CreditCard className="h-5 w-5" />
            Детали платежа
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Сумма */}
          <div className="p-4 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-sm text-muted-foreground mb-1">Сумма платежа</p>
            <p className="text-3xl font-bold font-mono text-emerald-400">
              {symbol}{Number(payment.amount).toLocaleString('ru-RU')}
            </p>
            {payment.amount_usd && payment.currency !== 'USD' && (
              <p className="text-sm text-muted-foreground mt-1">
                ≈ ${Number(payment.amount_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
              </p>
            )}
          </div>

          {/* Информация */}
          <div className="space-y-3">
            {/* Тип платежа */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Тип платежа</p>
                <p className="text-sm font-medium text-foreground">
                  {PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type}
                </p>
              </div>
            </div>

            {/* Касса */}
            {payment.cashboxes && (
              <Link href={`/finance/${payment.cashbox_id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Касса</p>
                    <p className="text-sm font-medium text-foreground">
                      {payment.cashboxes.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.cashboxes.currency}
                    </p>
                  </div>
                </div>
              </Link>
            )}

            {/* Курс обмена */}
            {payment.exchange_rate && payment.exchange_rate !== 1 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Курс обмена</p>
                  <p className="text-sm font-medium text-foreground">
                    1 {payment.currency} = {Number(payment.exchange_rate).toFixed(4)} USD
                  </p>
                </div>
              </div>
            )}

            {/* Дата */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Дата платежа</p>
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(payment.created_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}
                </p>
              </div>
            </div>

            {/* Примечание */}
            {payment.notes && (
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Примечание</p>
                <p className="text-sm text-foreground">{payment.notes}</p>
              </div>
            )}
          </div>

          {/* ID */}
          <p className="text-xs text-muted-foreground text-center">
            ID: {payment.id}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
