'use client'

import React from "react"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { depositWithdraw } from '@/app/actions/cashbox'
import { toast } from 'sonner'
import { Cashbox } from '@/lib/types/database'

type Props = {
  type: 'DEPOSIT' | 'WITHDRAW'
  cashboxId?: string
  children?: React.ReactNode
  onSuccess?: () => void
}

export function DepositWithdrawDialog({ type, cashboxId, children, onSuccess }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [selectedCashboxId, setSelectedCashboxId] = useState<string>(cashboxId || '')
  const [amount, setAmount] = useState<number | null>(null)
  const [description, setDescription] = useState('')

  const selectedCashbox = cashboxes.find(c => c.id === selectedCashboxId)

  useEffect(() => {
    async function loadCashboxes() {
      const supabase = createClient()
      const { data } = await supabase
        .from('cashboxes')
        .select('*')
        .eq('is_archived', false)
        .order('name')
      setCashboxes(data || [])
    }
    if (open) {
      loadCashboxes()
      // Если передан cashboxId, устанавливаем его
      if (cashboxId) {
        setSelectedCashboxId(cashboxId)
      }
    }
  }, [open, cashboxId])

  const handleSubmit = async () => {
    if (!selectedCashboxId || !amount || amount <= 0) {
      toast.error('Выберите кассу и укажите сумму')
      return
    }

    setIsLoading(true)
    try {
      const result = await depositWithdraw({
        cashboxId: selectedCashboxId,
        amount,
        type,
        description,
      })

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        setSelectedCashboxId('')
        setAmount(null)
        setDescription('')
        router.refresh()
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Ошибка операции')
    } finally {
      setIsLoading(false)
    }
  }

  const isDeposit = type === 'DEPOSIT'
  const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="border-border bg-transparent">
            <Icon className="h-4 w-4 mr-2" />
            {isDeposit ? 'Внести' : 'Вывести'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isDeposit ? 'Внесение средств' : 'Вывод средств'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isDeposit ? 'Добавить деньги в кассу' : 'Изъять деньги из кассы'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Касса
            </Label>
            <Select value={selectedCashboxId} onValueChange={setSelectedCashboxId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Выберите кассу" />
              </SelectTrigger>
              <SelectContent>
                {cashboxes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({Number(c.balance).toLocaleString('ru-RU')} {c.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Сумма
            </Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              currency={selectedCashbox?.currency as 'RUB' | 'USD' | 'USDT' | 'EUR' || 'RUB'}
              placeholder="0.00"
            />
            {!isDeposit && selectedCashbox && (
              <p className="text-xs text-muted-foreground">
                Доступно: {Number(selectedCashbox.balance).toLocaleString('ru-RU')} {selectedCashbox.currency}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Описание (опционально)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Причина операции..."
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
            variant={isDeposit ? 'default' : 'destructive'}
          >
            {isDeposit ? 'Внести' : 'Вывести'}
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
