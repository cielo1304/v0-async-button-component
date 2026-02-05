'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Car as CarIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Cashbox, Car } from '@/lib/types/database'
import { Textarea } from '@/components/ui/textarea'

const DEAL_TYPES = [
  { value: 'SALE', label: 'Продажа' },
  { value: 'TRADE_IN', label: 'Trade-In' },
  { value: 'LOAN', label: 'Кредит' },
  { value: 'PARTNER', label: 'Партнерская' },
]

const CURRENCIES = ['USD', 'RUB', 'USDT', 'EUR'] as const

interface Payment {
  id: string
  type: 'CASH' | 'BANK_TRANSFER' | 'CRYPTO' | 'TRADE_IN'
  amount: number | null
  currency: typeof CURRENCIES[number]
  cashboxId: string
}

export function AddDealDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Справочники
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [cars, setCars] = useState<Car[]>([])

  // Основные данные
  const [dealType, setDealType] = useState<string>('SALE')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')

  // Автомобиль
  const [carId, setCarId] = useState<string>('')

  // Финансы
  const [contractCurrency, setContractCurrency] = useState<typeof CURRENCIES[number]>('USD')
  const [contractAmount, setContractAmount] = useState<number | null>(null)

  // Платежи
  const [payments, setPayments] = useState<Payment[]>([])
  
  // Заметки
  const [notes, setNotes] = useState('')

  const supabase = createClient()

  const loadData = useCallback(async () => {
    // Загрузка касс
    const { data: cashboxData } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_archived', false)
      .order('name')

    if (cashboxData) setCashboxes(cashboxData)

    // Загрузка доступных авто (IN_STOCK)
    const { data: carsData } = await supabase
      .from('cars')
      .select('*')
      .eq('status', 'IN_STOCK')
      .order('brand')

    if (carsData) setCars(carsData)
  }, [supabase])

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  const addPayment = () => {
    const defaultCashbox = cashboxes.find((c) => c.currency === contractCurrency)
    setPayments([
      ...payments,
      {
        id: crypto.randomUUID(),
        type: 'CASH',
        amount: null,
        currency: contractCurrency,
        cashboxId: defaultCashbox?.id || 'defaultCashboxId', // Updated value prop to be a non-empty string
      },
    ])
  }

  const removePayment = (id: string) => {
    setPayments(payments.filter((p) => p.id !== id))
  }

  const updatePayment = (id: string, field: keyof Payment, value: string | number | null) => {
    setPayments(
      payments.map((p) => {
        if (p.id !== id) return p
        
        const updated = { ...p, [field]: value }
        
        // При смене валюты платежа подбираем подходящую кассу
        if (field === 'currency') {
          const matchingCashbox = cashboxes.find((c) => c.currency === value)
          if (matchingCashbox) {
            updated.cashboxId = matchingCashbox.id
          }
        }
        
        return updated
      })
    )
  }

  const getCashboxesForCurrency = (currency: string) => {
    return cashboxes.filter((c) => c.currency === currency)
  }

  const getTotalPaymentsUSD = () => {
    // Простая конвертация для отображения (в реальности нужны курсы из БД)
    const rates: Record<string, number> = { USD: 1, USDT: 1, RUB: 0.0108, EUR: 1.08 }
    return payments.reduce((sum, p) => {
      const amount = p.amount || 0
      const rate = rates[p.currency] || 1
      return sum + amount * rate
    }, 0)
  }

  const handleSubmit = async () => {
    if (!clientName) {
      toast.error('Укажите имя клиента')
      return
    }
    if (!contractAmount || contractAmount <= 0) {
      toast.error('Укажите сумму контракта')
      return
    }

    setIsLoading(true)
    try {
      // Генерируем номер сделки
      const dealNumber = `DEAL-${Date.now().toString(36).toUpperCase()}`

      // Рассчитываем сумму в USD
      const rates: Record<string, number> = { USD: 1, USDT: 1, RUB: 0.0108, EUR: 1.08 }
      const contractAmountUSD =
        contractCurrency === 'USD' ? contractAmount : contractAmount * (rates[contractCurrency] || 1)

      // Рассчитываем маржу (прибыль) = сумма контракта - себестоимость авто
      let marginAmount = 0
      if (selectedCar?.cost_price) {
        // Если валюта контракта совпадает с валютой закупки авто
        if (contractCurrency === 'RUB') {
          marginAmount = contractAmount - Number(selectedCar.cost_price)
        } else {
          // Конвертируем себестоимость в валюту контракта
          const costInContractCurrency = Number(selectedCar.cost_price) * (rates[contractCurrency] || 1)
          marginAmount = contractAmount - costInContractCurrency
        }
      }

      // Создаем/находим контакт клиента
      let contactId: string | null = null
      const { data: contactData } = await supabase.rpc('get_or_create_contact', {
        p_display_name: clientName,
        p_phone: clientPhone || null,
        p_email: clientEmail || null,
        p_module: 'deals'
      })
      contactId = contactData

      // Создаем сделку
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          deal_number: dealNumber,
          client_name: clientName,
          client_phone: clientPhone || null,
          client_email: clientEmail || null,
          car_id: carId || null,
          contact_id: contactId,
          status: payments.length > 0 ? 'IN_PROGRESS' : 'NEW',
          total_amount: contractAmount,
          total_currency: contractCurrency,
          paid_amount_usd: 0,
          margin_amount: marginAmount,
          notes: notes || null,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
        .select()
        .single()

      if (dealError) throw dealError
      
      // Логируем событие контакта
      if (contactId) {
        await supabase.rpc('log_contact_event', {
          p_contact_id: contactId,
          p_module: 'deals',
          p_entity_type: 'deal',
          p_entity_id: deal.id,
          p_title: `Сделка ${dealNumber} создана`,
          p_payload: {
            total_amount: contractAmount,
            currency: contractCurrency,
            status: deal.status,
            deal_number: dealNumber
          }
        })
      }

      // Если выбрано авто - резервируем его
      if (carId) {
        await supabase.from('cars').update({ status: 'RESERVED' }).eq('id', carId)

        // Записываем в timeline авто
        await supabase.from('car_timeline').insert({
          car_id: carId,
          event_type: 'STATUS_CHANGE',
          old_value: { status: 'IN_STOCK' },
          new_value: { status: 'RESERVED' },
          description: `Зарезервировано по сделке ${dealNumber}`,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
      }

      // Обрабатываем платежи
      let totalPaidUSD = 0

      for (const payment of payments) {
        if (!payment.amount || payment.amount <= 0 || !payment.cashboxId) continue

        const cashbox = cashboxes.find((c) => c.id === payment.cashboxId)
        if (!cashbox) continue

        // Конвертируем в USD
        const paymentUSD = payment.amount * (rates[payment.currency] || 1)
        totalPaidUSD += paymentUSD

        // Обновляем баланс кассы
        const newBalance = Number(cashbox.balance) + payment.amount
        await supabase
          .from('cashboxes')
          .update({ balance: newBalance })
          .eq('id', payment.cashboxId)

        // Создаем транзакцию
        await supabase.from('transactions').insert({
          cashbox_id: payment.cashboxId,
          amount: payment.amount,
          balance_after: newBalance,
          category: 'DEAL_PAYMENT',
          description: `Оплата по сделке ${dealNumber} от ${clientName}`,
          deal_id: deal.id,
          created_by: '00000000-0000-0000-0000-000000000000',
        })

        // Создаем запись платежа
        await supabase.from('deal_payments').insert({
          deal_id: deal.id,
          cashbox_id: payment.cashboxId,
          amount: payment.amount,
          currency: payment.currency,
          amount_usd: paymentUSD,
          exchange_rate: rates[payment.currency] || 1,
          payment_type: 'PREPAYMENT',
          created_by: '00000000-0000-0000-0000-000000000000',
        })
      }

      // Обновляем сумму оплаты в сделке
      if (totalPaidUSD > 0) {
        await supabase
          .from('deals')
          .update({
            paid_amount_usd: totalPaidUSD,
            status: totalPaidUSD >= contractAmountUSD ? 'PAID' : 'IN_PROGRESS',
          })
          .eq('id', deal.id)
      }

      toast.success(`Сделка ${dealNumber} создана`)
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[v0] Error creating deal:', errorMessage)
      toast.error('Ошибка при создании сделки')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setDealType('SALE')
    setClientName('')
    setClientPhone('')
    setClientEmail('')
    setCarId('')
    setContractCurrency('USD')
    setContractAmount(null)
    setPayments([])
    setNotes('')
  }

  const selectedCar = cars.find((c) => c.id === carId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Новая сделка
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Новая сделка</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Создать контракт с клиентом
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Тип сделки */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Тип сделки
              </Label>
              <Select value={dealType} onValueChange={setDealType}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Автомобиль
              </Label>
              <Select value={carId} onValueChange={setCarId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите авто" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="noCarSelected">Без авто</SelectItem> {/* Updated value prop to be a non-empty string */}
                  {cars.map((car) => (
                    <SelectItem key={car.id} value={car.id}>
                      {car.brand} {car.model} ({car.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Информация об авто */}
          {selectedCar && (
            <div className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center gap-3">
              <CarIcon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {selectedCar.brand} {selectedCar.model}
                </p>
                <p className="text-xs text-muted-foreground">
                  VIN: {selectedCar.vin || 'Н/Д'} | Себестоимость:{' '}
                  {selectedCar.cost_price?.toLocaleString()} ₽ | Прайс:{' '}
                  {selectedCar.list_price?.toLocaleString()} {selectedCar.list_currency}
                </p>
              </div>
            </div>
          )}

          {/* Прогноз прибыли */}
          {selectedCar && contractAmount && contractAmount > 0 && (
            <div className="p-3 rounded-lg border border-border bg-secondary/30">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Прогноз прибыли:</span>
                {(() => {
                  const rates: Record<string, number> = { USD: 1, USDT: 1, RUB: 0.0108, EUR: 1.08 }
                  let margin = 0
                  if (selectedCar?.cost_price) {
                    if (contractCurrency === 'RUB') {
                      margin = contractAmount - Number(selectedCar.cost_price)
                    } else {
                      const costInCurrency = Number(selectedCar.cost_price) * rates[contractCurrency]
                      margin = contractAmount - costInCurrency
                    }
                  }
                  return (
                    <span className={`font-mono font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {margin >= 0 ? '+' : ''}{margin.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {contractCurrency}
                    </span>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Клиент */}
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Данные клиента
            </Label>
            <div className="grid grid-cols-1 gap-3">
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="ФИО клиента *"
                className="bg-background border-border"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Телефон"
                  className="bg-background border-border"
                />
                <Input
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  className="bg-background border-border"
                />
              </div>
            </div>
          </div>

          {/* Сумма контракта */}
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Сумма контракта
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput
                value={contractAmount}
                onValueChange={setContractAmount}
                currency={contractCurrency}
                placeholder="0.00"
              />
              <Select
                value={contractCurrency}
                onValueChange={(v) => setContractCurrency(v as typeof CURRENCIES[number])}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Платежи */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Платежи (опционально)
              </Label>
              <Button variant="outline" size="sm" onClick={addPayment}>
                <Plus className="h-4 w-4 mr-1" />
                Добавить платеж
              </Button>
            </div>

            {payments.length > 0 && (
              <div className="space-y-3">
                {payments.map((payment, index) => (
                  <div
                    key={payment.id}
                    className="p-3 rounded-lg bg-secondary/30 border border-border space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        Платеж #{index + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePayment(payment.id)}
                        className="h-8 w-8 p-0 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Сумма</Label>
                        <Input
                          type="number"
                          value={payment.amount || ''}
                          onChange={(e) =>
                            updatePayment(
                              payment.id,
                              'amount',
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="0.00"
                          className="bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Валюта</Label>
                        <Select
                          value={payment.currency}
                          onValueChange={(v) => updatePayment(payment.id, 'currency', v)}
                        >
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Касса</Label>
                        <Select
                          value={payment.cashboxId}
                          onValueChange={(v) => updatePayment(payment.id, 'cashboxId', v)}
                        >
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue placeholder="Выберите" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCashboxesForCurrency(payment.currency).map((cb) => (
                              <SelectItem key={cb.id} value={cb.id}>
                                {cb.name} ({Number(cb.balance).toLocaleString()})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="text-right text-sm text-muted-foreground">
                  Всего оплачено: <span className="font-mono text-emerald-400">
                    ${getTotalPaymentsUSD().toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Заметки */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Заметки
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация..."
              className="bg-background border-border resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton isLoading={isLoading} loadingText="Создание..." onClick={handleSubmit}>
            Создать сделку
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
