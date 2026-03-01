'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Cashbox } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { cashboxTransfer } from '@/app/actions/cashbox'
import { toast } from 'sonner'
import { ArrowRightLeft } from 'lucide-react'

interface TransferDialogProps {
  fromCashbox: Cashbox
  onSuccess?: () => void
}

export function TransferDialog({ fromCashbox, onSuccess }: TransferDialogProps) {
  const [open, setOpen] = useState(false)
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [toCashboxId, setToCashboxId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (open) {
      loadCashboxes()
    }
  }, [open])

  const loadCashboxes = async () => {
    const { data } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_archived', false)
      .eq('currency', fromCashbox.currency) // Только кассы той же валюты
      .neq('id', fromCashbox.id) // Исключаем текущую кассу
      .order('name')

    setCashboxes(data || [])
  }

  const handleSubmit = async () => {
    if (!amount || amount <= 0) {
      toast.error('Укажите сумму')
      return
    }

    if (amount > Number(fromCashbox.balance)) {
      toast.error(`Недостаточно средств. Доступно: ${Number(fromCashbox.balance).toLocaleString('ru-RU')} ${fromCashbox.currency}`)
      return
    }

    if (!toCashboxId) {
      toast.error('Выберите кассу получателя')
      return
    }

    setIsLoading(true)

    try {
      const result = await cashboxTransfer({
        fromCashboxId: fromCashbox.id,
        toCashboxId,
        amount,
        note: description || undefined,
      })

      if (result.success) {
        toast.success(`Перевод выполнен: ${amount.toLocaleString('ru-RU')} ${fromCashbox.currency}`)
        setOpen(false)
        setAmount(null)
        setToCashboxId('')
        setDescription('')
        onSuccess?.()
      } else {
        toast.error(result.error || 'Ошибка при выполнении перевода')
      }
    } catch {
      toast.error('Ошибка при выполнении перевода')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-transparent">
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Перемещение
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Перевод между кассами</DialogTitle>
          <DialogDescription>
            Из: {fromCashbox.name} ({fromCashbox.currency})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-foreground">Куда перевести</Label>
            <Select value={toCashboxId} onValueChange={setToCashboxId}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue placeholder="Выберите кассу" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {cashboxes.map((cb) => (
                  <SelectItem key={cb.id} value={cb.id}>
                    {cb.name} ({Number(cb.balance).toLocaleString('ru-RU')} {cb.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cashboxes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Нет других касс с валютой {fromCashbox.currency}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Сумма</Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              currency={fromCashbox.currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              Доступно: {Number(fromCashbox.balance).toLocaleString('ru-RU')} {fromCashbox.currency}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Описание (опционально)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Комментарий к переводу..."
              className="bg-secondary border-border text-foreground"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={cashboxes.length === 0}
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
            Перевести
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
