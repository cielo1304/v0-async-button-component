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
import { Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Car, Cashbox, Currency } from '@/lib/types/database'
import { recordAutoExpenseV2 } from '@/app/actions/auto'

const EXPENSE_CATEGORIES = [
  { value: 'REPAIR', label: 'Ремонт' },
  { value: 'PARTS', label: 'Запчасти' },
  { value: 'SERVICE', label: 'ТО' },
  { value: 'PAINT', label: 'Покраска' },
  { value: 'DETAILING', label: 'Детейлинг' },
  { value: 'TRANSPORT', label: 'Доставка' },
  { value: 'OTHER', label: 'Прочее' },
]

const CURRENCIES: Currency[] = ['RUB', 'USD', 'USDT', 'EUR']

export function AddExpenseDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cars, setCars] = useState<Car[]>([])
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  
  const [selectedCarId, setSelectedCarId] = useState<string>('')
  const [selectedCashboxId, setSelectedCashboxId] = useState<string>('')
  const [category, setCategory] = useState<string>('REPAIR')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('RUB')
  const [description, setDescription] = useState('')

  const selectedCashbox = cashboxes.find(c => c.id === selectedCashboxId)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      const [carsResult, cashboxResult] = await Promise.all([
        supabase
          .from('cars')
          .select('*')
          .neq('status', 'SOLD')
          .order('brand'),
        supabase
          .from('cashboxes')
          .select('*')
          .eq('is_archived', false)
          .order('name'),
      ])
      
      setCars(carsResult.data || [])
      setCashboxes(cashboxResult.data || [])
    }
    if (open) loadData()
  }, [open])

  const handleSubmit = async () => {
    if (!selectedCarId || !selectedCashboxId || !amount || amount <= 0 || !category) {
      toast.error('Заполните все обязательные поля')
      return
    }

    setIsLoading(true)
    try {
      const result = await recordAutoExpenseV2({
        carId: selectedCarId,
        dealId: undefined,
        cashboxId: selectedCashboxId,
        amount,
        currency,
        type: category,
        description: description || EXPENSE_CATEGORIES.find(c => c.value === category)?.label,
        paidBy: 'COMPANY',
        ownerShare: 0,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to record expense')
      }

      toast.success('Расход добавлен')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('[v0] Error:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при добавлении расхода')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedCarId('')
    setSelectedCashboxId('')
    setCategory('REPAIR')
    setAmount(null)
    setCurrency('RUB')
    setDescription('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-transparent">
          <Wrench className="h-4 w-4 mr-2" />
          Добавить расход
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Добавить расход на авто</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ремонт, запчасти или другие расходы
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Автомобиль
            </Label>
            <Select value={selectedCarId} onValueChange={setSelectedCarId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Выберите авто" />
              </SelectTrigger>
              <SelectContent>
                {cars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.brand} {c.model} ({c.year}) {c.vin && `- ${c.vin.slice(-6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Касса (откуда списать)
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
              Категория расхода
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Описание
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что было сделано..."
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
            loadingText="Добавление..."
            onClick={handleSubmit}
            variant="destructive"
          >
            Списать расход
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
