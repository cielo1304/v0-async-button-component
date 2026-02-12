'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { GodModeActorSelector } from '@/components/finance/god-mode-actor-selector'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { CreditCard } from 'lucide-react'
import { Cashbox, AutoPayment } from '@/lib/types/database'
import { recordAutoPaymentV2 } from '@/app/actions/auto'

interface AddPaymentDialogProps {
  dealId: string
  currency: string
  onSuccess?: () => void
}

export function AddPaymentDialog({ dealId, currency, onSuccess }: AddPaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [pendingPayments, setPendingPayments] = useState<AutoPayment[]>([])
  const [selectedPaymentId, setSelectedPaymentId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [cashboxId, setCashboxId] = useState('')
  const [note, setNote] = useState('')
  const [actorEmployeeId, setActorEmployeeId] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const [cashboxesRes, paymentsRes] = await Promise.all([
        supabase.from('cashboxes').select('*').eq('is_archived', false).eq('currency', currency).order('name'),
        supabase.from('auto_payments').select('*').eq('deal_id', dealId).in('status', ['PENDING', 'PARTIAL', 'OVERDUE']).order('payment_number'),
      ])

      if (cashboxesRes.data) setCashboxes(cashboxesRes.data)
      if (paymentsRes.data) setPendingPayments(paymentsRes.data)
    }

    if (open) loadData()
  }, [open, dealId, currency])

  const selectedPayment = pendingPayments.find(p => p.id === selectedPaymentId)
  const remainingAmount = selectedPayment 
    ? Number(selectedPayment.amount) - Number(selectedPayment.paid_amount)
    : 0

  const handleSubmit = async () => {
    if (!amount || amount <= 0) {
      toast.error('Введите сумму платежа')
      return
    }
    if (!cashboxId) {
      toast.error('Выберите кассу')
      return
    }

    setIsLoading(true)

    try {
      const result = await recordAutoPaymentV2({
        dealId,
        cashboxId,
        amount,
        currency,
        schedulePaymentId: selectedPaymentId || undefined,
        note: note || undefined,
        actorEmployeeId: actorEmployeeId || undefined,
      })

      if (!result.success) {
        toast.error(result.error || 'Ошибка при проведении платежа')
        return
      }

      toast.success('Платеж принят')
      setOpen(false)
      setAmount(null)
      setCashboxId('')
      setSelectedPaymentId('')
      setNote('')
      onSuccess?.()
    } catch (error) {
      console.error('[v0] Error processing payment:', error)
      toast.error('Ошибка при проведении платежа')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CreditCard className="h-4 w-4 mr-2" />
          Принять платеж
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Принять платеж</DialogTitle>
          <DialogDescription>Внесите платеж по сделке</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Выбор платежа из графика */}
          {pendingPayments.length > 0 && (
            <div>
              <Label>Платеж из графика (опционально)</Label>
              <Select value={selectedPaymentId} onValueChange={setSelectedPaymentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите платеж или оставьте пустым" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Новый платеж</SelectItem>
                  {pendingPayments.map((payment) => (
                    <SelectItem key={payment.id} value={payment.id}>
                      Платеж #{payment.payment_number} - {Number(payment.amount).toLocaleString()} {payment.currency}
                      {Number(payment.paid_amount) > 0 && ` (оплачено ${Number(payment.paid_amount).toLocaleString()})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPayment && remainingAmount > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Остаток к оплате: {remainingAmount.toLocaleString()} {currency}
                </p>
              )}
            </div>
          )}

          {/* Сумма */}
          <div>
            <Label>Сумма платежа *</Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
            />
            {selectedPayment && remainingAmount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setAmount(remainingAmount)}
              >
                Внести полную сумму ({remainingAmount.toLocaleString()})
              </Button>
            )}
          </div>

          {/* Касса */}
          <div>
            <Label>Касса *</Label>
            <Select value={cashboxId} onValueChange={setCashboxId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите кассу" />
              </SelectTrigger>
              <SelectContent>
                {cashboxes.map((cb) => (
                  <SelectItem key={cb.id} value={cb.id}>
                    {cb.name} (баланс: {Number(cb.balance).toLocaleString()} {cb.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Примечание */}
          <div>
            <Label>Примечание</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Дополнительная информация о платеже"
              rows={2}
            />
          </div>

          {/* God Mode */}
          <GodModeActorSelector
            value={actorEmployeeId}
            onChange={setActorEmployeeId}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <AsyncButton onClick={handleSubmit} isLoading={isLoading}>
            Принять платеж
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
