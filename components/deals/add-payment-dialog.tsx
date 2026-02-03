'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Cashbox, Deal, Currency } from '@/lib/types/database'

const PAYMENT_TYPES = [
  { value: 'PREPAYMENT', label: 'Предоплата' },
  { value: 'PARTIAL', label: 'Частичная оплата' },
  { value: 'FINAL', label: 'Финальная оплата' },
  { value: 'REFUND', label: 'Возврат' },
]

const CURRENCIES: Currency[] = ['RUB', 'USD', 'USDT', 'EUR']

type Props = {
  deal?: Deal
}

export function AddPaymentDialog({ deal }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  
  const [selectedDealId, setSelectedDealId] = useState<string>(deal?.id || '')
  const [selectedCashboxId, setSelectedCashboxId] = useState<string>('')
  const [paymentType, setPaymentType] = useState<string>('PARTIAL')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [exchangeRate, setExchangeRate] = useState<number | null>(1)
  const [notes, setNotes] = useState('')

  const selectedCashbox = cashboxes.find(c => c.id === selectedCashboxId)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      const [cashboxResult, dealsResult] = await Promise.all([
        supabase
          .from('cashboxes')
          .select('*')
          .eq('is_archived', false)
          .order('name'),
        supabase
          .from('deals')
          .select('*')
          .in('status', ['NEW', 'IN_PROGRESS', 'PENDING_PAYMENT'])
          .order('created_at', { ascending: false }),
      ])
      
      setCashboxes(cashboxResult.data || [])
      setDeals(dealsResult.data || [])
    }
    if (open) loadData()
  }, [open])

  const handleSubmit = async () => {
    if (!selectedDealId || !selectedCashboxId || !amount || amount <= 0) {
      toast.error('Заполните все обязательные поля')
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      
      // Вычисляем сумму в USD
      const amountUsd = currency === 'USD' ? amount : amount / (exchangeRate || 1)
      
      // Получаем сделку
      const currentDeal = deals.find(d => d.id === selectedDealId)
      if (!currentDeal) throw new Error('Сделка не найдена')
      
      // Обновляем баланс кассы (если не возврат)
      if (paymentType !== 'REFUND') {
        const { error: cashboxError } = await supabase
          .from('cashboxes')
          .update({ balance: Number(selectedCashbox!.balance) + amount })
          .eq('id', selectedCashboxId)
        
        if (cashboxError) throw cashboxError
      }
      
      // Создаем платеж
      const { error: paymentError } = await supabase
        .from('deal_payments')
        .insert({
          deal_id: selectedDealId,
          cashbox_id: selectedCashboxId,
          amount,
          currency,
          amount_usd: amountUsd,
          exchange_rate: exchangeRate,
          payment_type: paymentType,
          notes: notes || null,
          created_by: '00000000-0000-0000-0000-000000000000', // TODO: заменить на реального пользователя
        })

      if (paymentError) throw paymentError
      
      // Обновляем сумму оплаты в сделке
      const effectiveAmountUsd = paymentType === 'REFUND' ? -amountUsd : amountUsd
      const newPaidAmount = Number(currentDeal.paid_amount_usd) + effectiveAmountUsd
      
      const { error: dealError } = await supabase
        .from('deals')
        .update({ 
          paid_amount_usd: newPaidAmount,
          status: newPaidAmount >= Number(currentDeal.total_amount) ? 'PAID' : currentDeal.status,
        })
        .eq('id', selectedDealId)
      
      if (dealError) throw dealError
      
      // Создаем транзакцию
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          cashbox_id: selectedCashboxId,
          amount: paymentType === 'REFUND' ? -amount : amount,
          balance_after: Number(selectedCashbox!.balance) + (paymentType === 'REFUND' ? -amount : amount),
          category: 'DEAL_PAYMENT',
          description: `Оплата по сделке ${currentDeal.deal_number}`,
          deal_id: selectedDealId,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
      
      if (txError) console.error('[v0] Transaction error:', txError)

      toast.success('Оплата добавлена')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('[v0] Error:', error)
      toast.error('Ошибка при добавлении оплаты')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    if (!deal) setSelectedDealId('')
    setSelectedCashboxId('')
    setPaymentType('PARTIAL')
    setAmount(null)
    setCurrency('USD')
    setExchangeRate(1)
    setNotes('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-transparent">
          <CreditCard className="h-4 w-4 mr-2" />
          Добавить оплату
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Добавить оплату</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Зафиксировать платеж по сделке
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!deal && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Сделка
              </Label>
              <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите сделку" />
                </SelectTrigger>
                <SelectContent>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.deal_number} - {d.client_name} ({Number(d.total_amount - d.paid_amount_usd).toLocaleString('ru-RU')} USD осталось)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Касса для зачисления
            </Label>
            <Select value={selectedCashboxId} onValueChange={setSelectedCashboxId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Выберите кассу" />
              </SelectTrigger>
              <SelectContent>
                {cashboxes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Тип платежа
            </Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Сумма
              </Label>
              <MoneyInput
                value={amount}
                onValueChange={setAmount}
                currency={currency}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Валюта
              </Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {currency !== 'USD' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Курс к USD
              </Label>
              <MoneyInput
                value={exchangeRate}
                onValueChange={setExchangeRate}
                currency="USD"
                placeholder="1.00"
              />
              {amount && exchangeRate && (
                <p className="text-xs text-muted-foreground">
                  = {(amount / exchangeRate).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} USD
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Примечание
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Комментарий к платежу..."
              className="bg-background border-border resize-none"
              rows={2}
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            isLoading={isLoading}
            loadingText="Обработка..."
            onClick={handleSubmit}
          >
            Добавить оплату
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
