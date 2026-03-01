'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Cashbox } from '@/lib/types/database'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { depositWithdraw } from '@/app/actions/cashbox'

interface CashboxOperationDialogProps {
  cashbox: Cashbox
  type: 'DEPOSIT' | 'WITHDRAW'
  onSuccess?: () => void
}

export function CashboxOperationDialog({ cashbox, type, onSuccess }: CashboxOperationDialogProps) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isDeposit = type === 'DEPOSIT'
  const title = isDeposit ? 'Внести средства' : 'Вывести средства'
  const buttonLabel = isDeposit ? 'Внести' : 'Вывести'
  const Icon = isDeposit ? TrendingUp : TrendingDown

  const handleSubmit = async () => {
    if (!amount || amount <= 0) {
      toast.error('Укажите сумму')
      return
    }

    if (type === 'WITHDRAW' && amount > Number(cashbox.balance)) {
      toast.error(`Недостаточно средств. Доступно: ${Number(cashbox.balance).toLocaleString('ru-RU')} ${cashbox.currency}`)
      return
    }

    setIsLoading(true)

    try {
      const result = await depositWithdraw({
        cashboxId: cashbox.id,
        amount,
        type,
        description: description || undefined,
      })

      if (!result.success) {
        toast.error(result.error || 'Ошибка при выполнении операции')
        return
      }

      toast.success(result.message || (isDeposit ? 'Средства внесены' : 'Средства выведены'))
      setOpen(false)
      setAmount(null)
      setDescription('')
      onSuccess?.()
    } catch {
      toast.error('Ошибка при выполнении операции')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={isDeposit ? 'default' : 'outline'}
          className={isDeposit 
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
            : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          }
        >
          <Icon className="h-4 w-4 mr-2" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription>
            {cashbox.name} ({cashbox.currency})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-foreground">Сумма</Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              currency={cashbox.currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
              placeholder="0.00"
            />
            {type === 'WITHDRAW' && (
              <p className="text-xs text-muted-foreground">
                Доступно: {Number(cashbox.balance).toLocaleString('ru-RU')} {cashbox.currency}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Описание (опционально)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Комментарий к операции..."
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
            className={isDeposit 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
            }
          >
            {buttonLabel}
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
