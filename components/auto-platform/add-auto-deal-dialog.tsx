'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FilePlus, Car, User, Calculator, Calendar, Percent } from 'lucide-react'
import { AutoClient, Car as CarType, Cashbox } from '@/lib/types/database'
import { createAutoDeal } from '@/app/actions/auto'

const DEAL_TYPES = [
  { value: 'CASH_SALE', label: 'Наличная продажа', description: 'Продажа авто с полной оплатой' },
  { value: 'COMMISSION_SALE', label: 'Комиссионная продажа', description: 'Продажа авто комитента с комиссией' },
  { value: 'INSTALLMENT', label: 'Рассрочка', description: 'Продажа с графиком платежей' },
  { value: 'RENT', label: 'Аренда', description: 'Сдача авто в аренду' },
]

const CURRENCIES = [
  { value: 'RUB', label: '₽ RUB' },
  { value: 'USD', label: '$ USD' },
  { value: 'USDT', label: '₮ USDT' },
  { value: 'EUR', label: '€ EUR' },
]

export function AddAutoDealDialog() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Справочники
  const [cars, setCars] = useState<CarType[]>([])
  const [clients, setClients] = useState<AutoClient[]>([])
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])

  // Основные данные сделки
  const [dealType, setDealType] = useState('CASH_SALE')
  const [carId, setCarId] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [sellerId, setSellerId] = useState('') // Для комиссии - комитент
  const [currency, setCurrency] = useState('RUB')

  // Наличная продажа / Комиссия
  const [salePrice, setSalePrice] = useState<number | null>(null)
  const [commissionPercent, setCommissionPercent] = useState<number | null>(10)
  const [commissionAmount, setCommissionAmount] = useState<number | null>(null)

  // Рассрочка
  const [downPayment, setDownPayment] = useState<number | null>(null)
  const [installmentMonths, setInstallmentMonths] = useState<number | null>(12)
  const [interestRate, setInterestRate] = useState<number | null>(0)
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(null)

  // Аренда
  const [rentPriceDaily, setRentPriceDaily] = useState<number | null>(null)
  const [rentStartDate, setRentStartDate] = useState('')
  const [rentEndDate, setRentEndDate] = useState('')
  const [depositAmount, setDepositAmount] = useState<number | null>(null)

  // Платеж
  const [initialPayment, setInitialPayment] = useState<number | null>(null)
  const [paymentCashboxId, setPaymentCashboxId] = useState('')

  const [notes, setNotes] = useState('')

  // Загрузка справочников
  useEffect(() => {
    async function loadData() {
      const [carsRes, clientsRes, cashboxesRes] = await Promise.all([
        supabase.from('cars').select('*').in('status', ['IN_STOCK', 'AVAILABLE']).order('brand'),
        supabase.from('auto_clients').select('*').eq('is_blacklisted', false).order('full_name'),
        supabase.from('cashboxes').select('*').eq('is_archived', false).order('name'),
      ])

      if (carsRes.data) setCars(carsRes.data)
      if (clientsRes.data) setClients(clientsRes.data)
      if (cashboxesRes.data) setCashboxes(cashboxesRes.data)
    }

    if (open) loadData()
  }, [open])

  // Авто-расчет комиссии
  useEffect(() => {
    if (salePrice && commissionPercent) {
      setCommissionAmount(Math.round(salePrice * commissionPercent / 100))
    }
  }, [salePrice, commissionPercent])

  // Авто-расчет ежемесячного платежа рассрочки
  useEffect(() => {
    if (salePrice && downPayment !== null && installmentMonths && installmentMonths > 0) {
      const remainingAmount = salePrice - (downPayment || 0)
      const rate = (interestRate || 0) / 100 / 12
      
      if (rate > 0) {
        // Аннуитетный платеж
        const payment = remainingAmount * (rate * Math.pow(1 + rate, installmentMonths)) / 
                       (Math.pow(1 + rate, installmentMonths) - 1)
        setMonthlyPayment(Math.round(payment))
      } else {
        // Без процентов
        setMonthlyPayment(Math.round(remainingAmount / installmentMonths))
      }
    }
  }, [salePrice, downPayment, installmentMonths, interestRate])

  // Расчет дней аренды
  const rentDays = useMemo(() => {
    if (!rentStartDate || !rentEndDate) return 0
    const start = new Date(rentStartDate)
    const end = new Date(rentEndDate)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }, [rentStartDate, rentEndDate])

  const rentTotal = useMemo(() => {
    return (rentPriceDaily || 0) * rentDays
  }, [rentPriceDaily, rentDays])

  const selectedCar = cars.find(c => c.id === carId)
  const filteredCashboxes = cashboxes.filter(cb => cb.currency === currency)

  const generateDealNumber = () => {
    const prefix = {
      CASH_SALE: 'CS',
      COMMISSION_SALE: 'CM',
      INSTALLMENT: 'IN',
      RENT: 'RN',
    }[dealType] || 'DL'
    const timestamp = Date.now().toString().slice(-6)
    return `${prefix}-${timestamp}`
  }

  const resetForm = () => {
    setDealType('CASH_SALE')
    setCarId('')
    setBuyerId('')
    setSellerId('')
    setCurrency('RUB')
    setSalePrice(null)
    setCommissionPercent(10)
    setCommissionAmount(null)
    setDownPayment(null)
    setInstallmentMonths(12)
    setInterestRate(0)
    setMonthlyPayment(null)
    setRentPriceDaily(null)
    setRentStartDate('')
    setRentEndDate('')
    setDepositAmount(null)
    setInitialPayment(null)
    setPaymentCashboxId('')
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!carId) {
      toast.error('Выберите автомобиль')
      return
    }
    if (!buyerId && dealType !== 'COMMISSION_SALE') {
      toast.error('Выберите покупателя/арендатора')
      return
    }

    setIsLoading(true)

    try {
      const dealNumber = generateDealNumber()

      // Рассчитываем total_debt
      let totalDebt = 0
      if (dealType === 'CASH_SALE') {
        totalDebt = (salePrice || 0) - (initialPayment || 0)
      } else if (dealType === 'COMMISSION_SALE') {
        totalDebt = (salePrice || 0) - (initialPayment || 0)
      } else if (dealType === 'INSTALLMENT') {
        totalDebt = (salePrice || 0) - (downPayment || 0) - (initialPayment || 0)
      } else if (dealType === 'RENT') {
        totalDebt = rentTotal + (depositAmount || 0) - (initialPayment || 0)
      }

      // Получаем contact_id из auto_clients
      const buyer = clients.find(c => c.id === buyerId)
      const seller = clients.find(c => c.id === sellerId)
      const buyerContactId = buyer?.contact_id || null
      const sellerContactId = seller?.contact_id || null

      const { data: deal, error: dealError } = await supabase
        .from('auto_deals')
        .insert({
          deal_number: dealNumber,
          deal_type: dealType,
          status: initialPayment && initialPayment > 0 ? 'IN_PROGRESS' : 'NEW',
          car_id: carId,
          buyer_id: buyerId || null,
          seller_id: sellerId || null, // Комитент для комиссии
          buyer_contact_id: buyerContactId,
          seller_contact_id: sellerContactId,
          sale_price: dealType !== 'RENT' ? salePrice : null,
          sale_currency: currency,
          commission_percent: dealType === 'COMMISSION_SALE' ? commissionPercent : null,
          commission_amount: dealType === 'COMMISSION_SALE' ? commissionAmount : null,
          down_payment: dealType === 'INSTALLMENT' ? downPayment : null,
          installment_months: dealType === 'INSTALLMENT' ? installmentMonths : null,
          monthly_payment: dealType === 'INSTALLMENT' ? monthlyPayment : null,
          interest_rate: dealType === 'INSTALLMENT' ? interestRate : null,
          rent_price_daily: dealType === 'RENT' ? rentPriceDaily : null,
          rent_start_date: dealType === 'RENT' ? rentStartDate : null,
          rent_end_date: dealType === 'RENT' ? rentEndDate : null,
          deposit_amount: dealType === 'RENT' ? depositAmount : null,
          total_paid: initialPayment || 0,
          total_debt: totalDebt > 0 ? totalDebt : 0,
          notes: notes || null,
        })
        .select()
        .single()

      if (dealError) throw dealError

      // Если есть начальный платеж - создаем запись в auto_payments и транзакцию
      if (initialPayment && initialPayment > 0 && paymentCashboxId) {
        // Создаем платеж
        const { error: paymentError } = await supabase.from('auto_payments').insert({
          deal_id: deal.id,
          payment_number: 1,
          due_date: new Date().toISOString().split('T')[0],
          amount: initialPayment,
          currency,
          paid_amount: initialPayment,
          paid_date: new Date().toISOString().split('T')[0],
          status: 'PAID',
          cashbox_id: paymentCashboxId,
        })

        if (paymentError) throw paymentError

        // Атомарно: обновляем баланс кассы + создаем транзакцию
        await supabase.rpc('cashbox_operation', {
          p_cashbox_id: paymentCashboxId,
          p_amount: initialPayment,
          p_category: 'DEPOSIT',
          p_description: `Оплата по сделке ${dealNumber} (${DEAL_TYPES.find(t => t.value === dealType)?.label})`,
          p_created_by: '00000000-0000-0000-0000-000000000000',
        })
      }

      // Обновляем статус авто
      await supabase
        .from('cars')
        .update({ 
          status: dealType === 'RENT' ? 'RESERVED' : 'RESERVED',
          platform_status: dealType === 'RENT' ? 'RENTED' : 'RESERVED',
        })
        .eq('id', carId)

      // Генерируем график платежей для рассрочки
      if (dealType === 'INSTALLMENT' && installmentMonths && monthlyPayment) {
        const payments = []
        const startDate = new Date()
        
        for (let i = 0; i < installmentMonths; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i + 1)
          
          payments.push({
            deal_id: deal.id,
            payment_number: i + 2, // +2 потому что 1 - первоначальный взнос
            due_date: dueDate.toISOString().split('T')[0],
            amount: monthlyPayment,
            currency,
            paid_amount: 0,
            status: 'PENDING',
          })
        }

        await supabase.from('auto_payments').insert(payments)
      }

      // Логируем события контактов
      const eventPayload = {
        deal_type: dealType,
        total_amount: salePrice || rentTotal,
        currency,
        status: deal.status,
        deal_number: dealNumber
      }
      
      if (buyerContactId) {
        await supabase.rpc('log_contact_event', {
          p_contact_id: buyerContactId,
          p_module: 'auto',
          p_entity_type: 'auto_deal',
          p_entity_id: deal.id,
          p_title: `Авто-сделка ${dealNumber} создана`,
          p_payload: eventPayload
        })
      }
      
      if (sellerContactId && sellerContactId !== buyerContactId) {
        await supabase.rpc('log_contact_event', {
          p_contact_id: sellerContactId,
          p_module: 'auto',
          p_entity_type: 'auto_deal',
          p_entity_id: deal.id,
          p_title: `Авто-сделка ${dealNumber} создана (комитент)`,
          p_payload: eventPayload
        })
      }

      // Record sale revenue in auto_ledger for P&L tracking
      const totalAmount = dealType === 'RENT' ? rentTotal : (salePrice || 0)
      if (totalAmount > 0) {
        await supabase.from('auto_ledger').insert({
          car_id: carId,
          deal_id: deal.id,
          category: 'SALE_REVENUE',
          amount: totalAmount,
          description: `${DEAL_TYPES.find(t => t.value === dealType)?.label} - ${dealNumber}`,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
      }

      toast.success(`Сделка ${dealNumber} создана`)
      resetForm()
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error('[v0] Error creating auto deal:', error)
      toast.error('Ошибка при создании сделки')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus className="h-4 w-4 mr-2" />
          Новая сделка
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая сделка автоплощадки</DialogTitle>
          <DialogDescription>Создайте сделку: продажа, комиссия, рассрочка или аренда</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Тип сделки */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DEAL_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setDealType(type.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  dealType === type.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-sm">{type.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
              </button>
            ))}
          </div>

          {/* Автомобиль */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Автомобиль *
            </Label>
            <Select value={carId} onValueChange={setCarId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите автомобиль" />
              </SelectTrigger>
              <SelectContent>
                {cars.map((car) => (
                  <SelectItem key={car.id} value={car.id}>
                    {car.brand} {car.model} {car.year} {car.vin ? `(${car.vin})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCar && (
              <Card className="bg-secondary/30">
                <CardContent className="py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Цена продажи:</span>
                    <span className="font-mono">{selectedCar.list_price?.toLocaleString()} {selectedCar.list_currency}</span>
                  </div>
                  {selectedCar.cost_price && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Себестоимость:</span>
                      <span className="font-mono">{Number(selectedCar.cost_price).toLocaleString()} ₽</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Покупатель/Арендатор */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {dealType === 'RENT' ? 'Арендатор' : 'Покупатель'} *
            </Label>
            <Select value={buyerId} onValueChange={setBuyerId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите клиента" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.full_name} {client.phone ? `(${client.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Комитент для комиссионной продажи */}
          {dealType === 'COMMISSION_SALE' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Комитент (владелец авто)
              </Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите комитента" />
                </SelectTrigger>
                <SelectContent>
                  {clients.filter(c => c.client_type === 'CONSIGNOR' || c.client_type === 'SELLER').map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name} {client.phone ? `(${client.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Параметры в зависимости от типа сделки */}
          {(dealType === 'CASH_SALE' || dealType === 'COMMISSION_SALE' || dealType === 'INSTALLMENT') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Цена продажи *</Label>
                <MoneyInput
                  value={salePrice}
                  onValueChange={setSalePrice}
                  currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                />
              </div>
              <div>
                <Label>Валюта</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Комиссия */}
          {dealType === 'COMMISSION_SALE' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Комиссия %
                </Label>
                <Input
                  type="number"
                  value={commissionPercent || ''}
                  onChange={(e) => setCommissionPercent(e.target.value ? Number(e.target.value) : null)}
                  placeholder="10"
                />
              </div>
              <div>
                <Label>Сумма комиссии</Label>
                <MoneyInput
                  value={commissionAmount}
                  onValueChange={setCommissionAmount}
                  currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                />
              </div>
            </div>
          )}

          {/* Рассрочка */}
          {dealType === 'INSTALLMENT' && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Первоначальный взнос</Label>
                  <MoneyInput
                    value={downPayment}
                    onValueChange={setDownPayment}
                    currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                  />
                </div>
                <div>
                  <Label>Срок (месяцев)</Label>
                  <Input
                    type="number"
                    value={installmentMonths || ''}
                    onChange={(e) => setInstallmentMonths(e.target.value ? Number(e.target.value) : null)}
                    placeholder="12"
                  />
                </div>
                <div>
                  <Label>Ставка % годовых</Label>
                  <Input
                    type="number"
                    value={interestRate || ''}
                    onChange={(e) => setInterestRate(e.target.value ? Number(e.target.value) : null)}
                    placeholder="0"
                  />
                </div>
              </div>
              {monthlyPayment && (
                <Card className="bg-amber-500/10 border-amber-500/30">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-amber-400" />
                      <div>
                        <p className="font-medium">Ежемесячный платеж: {monthlyPayment.toLocaleString()} {currency}</p>
                        <p className="text-sm text-muted-foreground">
                          Переплата: {((monthlyPayment * (installmentMonths || 0)) - ((salePrice || 0) - (downPayment || 0))).toLocaleString()} {currency}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Аренда */}
          {dealType === 'RENT' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Цена за день</Label>
                  <MoneyInput
                    value={rentPriceDaily}
                    onValueChange={setRentPriceDaily}
                    currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                  />
                </div>
                <div>
                  <Label>Депозит</Label>
                  <MoneyInput
                    value={depositAmount}
                    onValueChange={setDepositAmount}
                    currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Дата начала
                  </Label>
                  <Input
                    type="date"
                    value={rentStartDate}
                    onChange={(e) => setRentStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Дата окончания
                  </Label>
                  <Input
                    type="date"
                    value={rentEndDate}
                    onChange={(e) => setRentEndDate(e.target.value)}
                  />
                </div>
              </div>
              {rentDays > 0 && (
                <Card className="bg-violet-500/10 border-violet-500/30">
                  <CardContent className="py-3">
                    <div className="flex justify-between">
                      <span>Период аренды:</span>
                      <span className="font-medium">{rentDays} дней</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Итого за аренду:</span>
                      <span className="font-mono font-bold">{rentTotal.toLocaleString()} {currency}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Начальный платеж */}
          <div className="border-t border-border pt-4 space-y-4">
            <h3 className="font-medium">Начальный платеж (опционально)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Сумма платежа</Label>
                <MoneyInput
                  value={initialPayment}
                  onValueChange={setInitialPayment}
                  currency={currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                />
              </div>
              <div>
                <Label>Касса</Label>
                <Select value={paymentCashboxId} onValueChange={setPaymentCashboxId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите кассу" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCashboxes.map((cb) => (
                      <SelectItem key={cb.id} value={cb.id}>
                        {cb.name} ({cb.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Примечание */}
          <div>
            <Label>Примечание</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация о сделке..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <AsyncButton onClick={handleSubmit} isLoading={isLoading}>
            Создать сделку
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
