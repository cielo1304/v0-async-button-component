'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Transaction, Cashbox, Deal, Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  Car as CarIcon,
  Briefcase,
  ArrowRightLeft,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'

const CATEGORY_LABELS: Record<string, string> = {
  DEPOSIT: 'Внесение средств',
  WITHDRAW: 'Вывод средств',
  DEAL_PAYMENT: 'Оплата по сделке',
  EXPENSE: 'Расход',
  SALARY: 'Зарплата',
  EXCHANGE_OUT: 'Обмен валют (отправлено)',
  EXCHANGE_IN: 'Обмен валют (получено)',
  TRANSFER_OUT: 'Перевод (отправлено)',
  TRANSFER_IN: 'Перевод (получено)',
}

const CATEGORY_COLORS: Record<string, string> = {
  DEPOSIT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  WITHDRAW: 'bg-red-500/10 text-red-400 border-red-500/20',
  DEAL_PAYMENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  EXPENSE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  SALARY: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  EXCHANGE_OUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  EXCHANGE_IN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  TRANSFER_OUT: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  TRANSFER_IN: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

interface TransactionDetailDialogProps {
  transaction: Transaction
  cashbox: Cashbox
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface RelatedData {
  deal: Deal | null
  car: Car | null
  exchangeLog: {
    from_box: Cashbox
    to_box: Cashbox
    sent_amount: number
    sent_currency: string
    received_amount: number
    received_currency: string
    rate: number
  } | null
  transferCashbox: Cashbox | null
}

export function TransactionDetailDialog({ 
  transaction, 
  cashbox, 
  open, 
  onOpenChange 
}: TransactionDetailDialogProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [relatedData, setRelatedData] = useState<RelatedData>({
    deal: null,
    car: null,
    exchangeLog: null,
    transferCashbox: null,
  })
  const supabase = createClient()

  useEffect(() => {
    if (!open) return

    const loadRelatedData = async () => {
      setIsLoading(true)
      try {
        const data: RelatedData = {
          deal: null,
          car: null,
          exchangeLog: null,
          transferCashbox: null,
        }

        // Загружаем связанную сделку
        if (transaction.deal_id) {
          const { data: deal } = await supabase
            .from('deals')
            .select('*, cars(*)')
            .eq('id', transaction.deal_id)
            .single()
          
          if (deal) {
            data.deal = deal
            data.car = deal.cars || null
          }
        }

        // Загружаем связанный обмен валют
        if (transaction.reference_id && 
            (transaction.category === 'EXCHANGE_OUT' || transaction.category === 'EXCHANGE_IN')) {
          const { data: exchangeLog } = await supabase
            .from('exchange_logs')
            .select(`
              *,
              from_box:cashboxes!exchange_logs_from_box_id_fkey(*),
              to_box:cashboxes!exchange_logs_to_box_id_fkey(*)
            `)
            .eq('id', transaction.reference_id)
            .single()
          
          if (exchangeLog) {
            data.exchangeLog = {
              from_box: exchangeLog.from_box,
              to_box: exchangeLog.to_box,
              sent_amount: exchangeLog.sent_amount,
              sent_currency: exchangeLog.sent_currency,
              received_amount: exchangeLog.received_amount,
              received_currency: exchangeLog.received_currency,
              rate: exchangeLog.rate,
            }
          }
        }

        // Загружаем связанный перевод
        if (transaction.reference_id && 
            (transaction.category === 'TRANSFER_OUT' || transaction.category === 'TRANSFER_IN')) {
          // Находим парную транзакцию перевода
          const { data: pairedTx } = await supabase
            .from('transactions')
            .select('*, cashboxes(*)')
            .eq('reference_id', transaction.reference_id)
            .neq('id', transaction.id)
            .single()
          
          if (pairedTx?.cashboxes) {
            data.transferCashbox = pairedTx.cashboxes as Cashbox
          }
        }

        setRelatedData(data)
      } catch {
        // Silent fail
      } finally {
        setIsLoading(false)
      }
    }

    loadRelatedData()
  }, [open, transaction, supabase])

  const formatMoney = (amount: number) => {
    return Number(amount).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            {transaction.amount > 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-400" />
            )}
            Детали операции
          </DialogTitle>
          <DialogDescription>
            {formatDate(transaction.created_at)}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Основная информация */}
            <Card className="bg-secondary/50 border-border">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Тип операции</span>
                  <Badge variant="outline" className={CATEGORY_COLORS[transaction.category] || ''}>
                    {CATEGORY_LABELS[transaction.category] || transaction.category}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Сумма</span>
                  <span className={`font-mono font-bold text-lg ${
                    transaction.amount > 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {transaction.amount > 0 ? '+' : ''}{formatMoney(transaction.amount)} {cashbox.currency}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Баланс после</span>
                  <span className="font-mono text-foreground">
                    {formatMoney(transaction.balance_after)} {cashbox.currency}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Касса</span>
                  <Link href={`/finance/${cashbox.id}`}>
                    <Button variant="link" size="sm" className="h-auto p-0 text-foreground">
                      {cashbox.name}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>

                {transaction.description && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground block mb-1">Описание</span>
                    <span className="text-foreground">{transaction.description}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Связанная сделка */}
            {relatedData.deal && (
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-medium text-blue-400">Связанная сделка</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Номер</span>
                      <Link href={`/deals/${relatedData.deal.id}`}>
                        <Button variant="link" size="sm" className="h-auto p-0 text-foreground">
                          {relatedData.deal.deal_number}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Клиент</span>
                      <span className="text-foreground">{relatedData.deal.client_name}</span>
                    </div>
                    {relatedData.car && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Автомобиль</span>
                        <Link href={`/cars/${relatedData.car.id}`}>
                          <Button variant="link" size="sm" className="h-auto p-0 text-foreground">
                            {relatedData.car.brand} {relatedData.car.model}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Связанный обмен валют */}
            {relatedData.exchangeLog && (
              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-400">Обмен валют</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="text-center">
                      <div className="font-mono font-bold text-foreground">
                        {formatMoney(relatedData.exchangeLog.sent_amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {relatedData.exchangeLog.sent_currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {relatedData.exchangeLog.from_box?.name}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-amber-400" />
                    <div className="text-center">
                      <div className="font-mono font-bold text-foreground">
                        {formatMoney(relatedData.exchangeLog.received_amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {relatedData.exchangeLog.received_currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {relatedData.exchangeLog.to_box?.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-center text-xs text-muted-foreground mt-2">
                    Курс: 1 {relatedData.exchangeLog.sent_currency} = {relatedData.exchangeLog.rate} {relatedData.exchangeLog.received_currency}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Связанный перевод */}
            {relatedData.transferCashbox && (
              <Card className="bg-zinc-500/5 border-zinc-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-400">Перевод между кассами</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="text-center">
                      <div className="text-sm font-medium text-foreground">
                        {transaction.category === 'TRANSFER_OUT' ? cashbox.name : relatedData.transferCashbox.name}
                      </div>
                      <div className="text-xs text-muted-foreground">Отправитель</div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-zinc-400" />
                    <div className="text-center">
                      <div className="text-sm font-medium text-foreground">
                        {transaction.category === 'TRANSFER_IN' ? cashbox.name : relatedData.transferCashbox.name}
                      </div>
                      <div className="text-xs text-muted-foreground">Получатель</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ID операции */}
            <div className="text-xs text-muted-foreground text-center pt-2">
              ID: {transaction.id}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
