'use client'

import React from "react"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Loader2, Wrench } from 'lucide-react'

const EXPENSE_TYPES = [
  { value: 'REPAIR', label: 'Ремонт' },
  { value: 'MAINTENANCE', label: 'ТО' },
  { value: 'CLEANING', label: 'Мойка/Химчистка' },
  { value: 'DOCUMENTS', label: 'Документы' },
  { value: 'STORAGE', label: 'Хранение' },
  { value: 'TRANSPORT', label: 'Транспортировка' },
  { value: 'OTHER', label: 'Прочее' },
]

const PAID_BY_OPTIONS = [
  { value: 'COMPANY', label: 'Компания' },
  { value: 'OWNER', label: 'Владелец' },
  { value: 'SHARED', label: 'Совместно' },
]

interface AddExpenseDialogProps {
  carId: string
  carName: string
}

export function AddExpenseDialog({ carId, carName }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cashboxes, setCashboxes] = useState<{ id: string; name: string; currency: string }[]>([])
  
  const [expenseType, setExpenseType] = useState('REPAIR')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('RUB')
  const [description, setDescription] = useState('')
  const [paidBy, setPaidBy] = useState('COMPANY')
  const [ownerShare, setOwnerShare] = useState('')
  const [cashboxId, setCashboxId] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadCashboxes() {
      const { data } = await supabase
        .from('cashboxes')
        .select('id, name, currency')
        .eq('is_archived', false)
        .order('name')
      setCashboxes(data || [])
    }
    if (open) loadCashboxes()
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description) {
      toast.error('Заполните обязательные поля')
      return
    }

    setIsLoading(true)
    try {
      const amountNum = parseFloat(amount)
      const ownerShareNum = ownerShare ? parseFloat(ownerShare) : 0

      // Если платит компания - создаем транзакцию
      let transactionId = null
      if (paidBy === 'COMPANY' || (paidBy === 'SHARED' && ownerShareNum < amountNum)) {
        if (!cashboxId) {
          toast.error('Выберите кассу для списания')
          setIsLoading(false)
          return
        }

        const deductAmount = paidBy === 'SHARED' ? amountNum - ownerShareNum : amountNum

        // Получаем кассу
        const { data: cashbox } = await supabase
          .from('cashboxes')
          .select('*')
          .eq('id', cashboxId)
          .single()

        if (!cashbox || cashbox.balance < deductAmount) {
          toast.error('Недостаточно средств в кассе')
          setIsLoading(false)
          return
        }

        // Создаем транзакцию
        const { data: transaction } = await supabase
          .from('transactions')
          .insert({
            cashbox_id: cashboxId,
            amount: -deductAmount,
            balance_after: cashbox.balance - deductAmount,
            category: 'EXPENSE',
            description: `Расход на авто ${carName}: ${description}`,
          })
          .select()
          .single()

        transactionId = transaction?.id

        // Обновляем баланс кассы
        await supabase
          .from('cashboxes')
          .update({ balance: cashbox.balance - deductAmount })
          .eq('id', cashboxId)
      }

      // Создаем расход
      const { error } = await supabase.from('auto_expenses').insert({
        car_id: carId,
        type: expenseType,
        amount: amountNum,
        currency,
        description,
        paid_by: paidBy,
        owner_share: ownerShareNum,
        cashbox_id: paidBy !== 'OWNER' ? cashboxId : null,
        transaction_id: transactionId,
        expense_date: expenseDate,
      })

      if (error) throw error

      toast.success('Расход добавлен')
      setOpen(false)
      router.refresh()

      // Reset form
      setAmount('')
      setDescription('')
      setOwnerShare('')
    } catch (error) {
      console.error('[v0] Error adding expense:', error)
      toast.error('Ошибка при добавлении расхода')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wrench className="h-4 w-4 mr-2" />
          Добавить расход
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить расход на авто</DialogTitle>
          <DialogDescription>{carName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Тип расхода</Label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Дата</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Сумма *</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUB">RUB</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Описание *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание работ или расходов"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Кто оплатил</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAID_BY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {paidBy === 'SHARED' && (
            <div className="space-y-2">
              <Label>Доля владельца</Label>
              <Input
                type="number"
                step="0.01"
                value={ownerShare}
                onChange={(e) => setOwnerShare(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {(paidBy === 'COMPANY' || paidBy === 'SHARED') && (
            <div className="space-y-2">
              <Label>Касса для списания</Label>
              <Select value={cashboxId} onValueChange={setCashboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите кассу" />
                </SelectTrigger>
                <SelectContent>
                  {cashboxes.map((box) => (
                    <SelectItem key={box.id} value={box.id}>
                      {box.name} ({box.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
