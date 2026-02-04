'use client'

import { DialogDescription } from "@/components/ui/dialog"
import { DialogTitle } from "@/components/ui/dialog"
import { DialogHeader } from "@/components/ui/dialog"
import { DialogContent } from "@/components/ui/dialog"
import { Dialog } from "@/components/ui/dialog"
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeftRight, Settings, History, TrendingUp,
  RefreshCw, Plus, Trash2, Check,
  Banknote, Home, ArrowDown, ArrowUp, X, ArrowRight, Pencil, Calculator
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate, ExchangeSettings, Cashbox } from '@/lib/types/database'
import { ExchangeRatesManager } from '@/components/exchange/exchange-rates-manager'
import { ExchangeHistoryList } from '@/components/exchange/exchange-history-list'
import { nanoid } from 'nanoid'

const CURRENCY_SYMBOLS: Record<string, string> = {
  'RUB': '₽',
  'USD': '$',
  'EUR': '€',
  'UAH': '₴',
  'TRY': '₺',
  'AED': 'د.إ',
  'CNY': '¥',
  'GBP': '£',
  'KZT': '₸',
}

const CURRENCY_FLAGS: Record<string, string> = {
  'RUB': '🇷🇺',
  'USD': '🇺🇸',
  'EUR': '🇪🇺',
  'UAH': '🇺🇦',
  'TRY': '🇹🇷',
  'AED': '🇦🇪',
  'CNY': '🇨🇳',
  'GBP': '🇬🇧',
  'KZT': '🇰🇿',
}

// Тип для строки обмена (валюта + сумма + касса)
interface ExchangeLine {
  id: string
  currency: string
  amount: string
  cashboxId: string
}

export default function ExchangePage() {
  const supabase = useMemo(() => createClient(), [])
  
  // Мультивалютный обмен: клиент дает N валют, получает M валют
  const [clientGives, setClientGives] = useState<ExchangeLine[]>([
    { id: nanoid(), currency: 'USD', amount: '', cashboxId: '' }
  ])
  const [clientReceives, setClientReceives] = useState<ExchangeLine[]>([
    { id: nanoid(), currency: 'RUB', amount: '', cashboxId: '' }
  ])
  
  // Данные клиента
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  
  // Данные из БД
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [settings, setSettings] = useState<ExchangeSettings | null>(null)
  const [todayStats, setTodayStats] = useState<{ count: number; volume: number; profit: number }>({ count: 0, volume: 0, profit: 0 })
  
  // Состояние UI
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('exchange')
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Для редактирования курса из панели
  const [selectedRate, setSelectedRate] = useState<ExchangeRate | null>(null)
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false)
  const [editProfitMethod, setEditProfitMethod] = useState<'auto' | 'manual' | 'fixed_percent'>('auto')
  const [editFixedBaseSource, setEditFixedBaseSource] = useState<'api' | 'manual'>('api')
  const [editMarginPercent, setEditMarginPercent] = useState('2.0')
  const [editBuyRate, setEditBuyRate] = useState('')
  const [editSellRate, setEditSellRate] = useState('')
  const [editApiRate, setEditApiRate] = useState<number | null>(null)
  const [isSavingRate, setIsSavingRate] = useState(false)
  
  // Доступные валюты
  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>()
    exchangeRates.forEach(r => {
      currencies.add(r.from_currency)
      currencies.add(r.to_currency)
    })
    return Array.from(currencies).sort()
  }, [exchangeRates])
  
  // Получить курс для пары валют
  const getRate = useCallback((from: string, to: string): ExchangeRate | undefined => {
    return exchangeRates.find(r => 
      r.from_currency === from && 
      r.to_currency === to &&
      r.is_active
    )
  }, [exchangeRates])
  
  // Получить кассы для валюты
  const getCashboxesForCurrency = useCallback((currency: string) => {
    return cashboxes.filter(c => c.currency === currency && !c.is_archived)
  }, [cashboxes])
  
  // Загрузка данных
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [ratesResult, cashboxesResult, settingsResult] = await Promise.all([
        supabase
          .from('exchange_rates')
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('cashboxes')
          .select('*')
          .eq('is_archived', false)
          .eq('is_exchange_enabled', true)
          .order('name'),
        supabase
          .from('exchange_settings')
          .select('*')
          .single()
      ])
      
      if (ratesResult.data) setExchangeRates(ratesResult.data)
      if (cashboxesResult.data) setCashboxes(cashboxesResult.data)
      if (settingsResult.data) setSettings(settingsResult.data)
      
      // Загрузка статистики за сегодня
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      
      const { data: todayOps } = await supabase
        .from('client_exchange_operations')
        .select('profit_amount, total_client_gives_usd')
        .eq('status', 'completed')
        .gte('completed_at', startOfDay.toISOString())
      
      if (todayOps) {
        setTodayStats({
          count: todayOps.length,
          volume: todayOps.reduce((sum, e) => sum + Number(e.total_client_gives_usd || 0), 0),
          profit: todayOps.reduce((sum, e) => sum + Number(e.profit_amount || 0), 0)
        })
      }
    } catch {
      toast.error('Ошибка загрузки данных')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Добавить строку валюты
  const addGiveLine = () => {
    if (clientGives.length >= 6) {
      toast.error('Максимум 6 валют')
      return
    }
    const usedCurrencies = clientGives.map(l => l.currency)
    const availableCurrency = availableCurrencies.find(c => !usedCurrencies.includes(c)) || 'USD'
    setClientGives([...clientGives, { 
      id: nanoid(), 
      currency: availableCurrency, 
      amount: '', 
      cashboxId: '' 
    }])
  }
  
  const addReceiveLine = () => {
    if (clientReceives.length >= 6) {
      toast.error('Максимум 6 валют')
      return
    }
    const usedCurrencies = clientReceives.map(l => l.currency)
    const availableCurrency = availableCurrencies.find(c => !usedCurrencies.includes(c)) || 'RUB'
    setClientReceives([...clientReceives, { 
      id: nanoid(), 
      currency: availableCurrency, 
      amount: '', 
      cashboxId: '' 
    }])
  }
  
  // Удалить строку валюты
  const removeGiveLine = (id: string) => {
    if (clientGives.length <= 1) return
    setClientGives(clientGives.filter(l => l.id !== id))
  }
  
  const removeReceiveLine = (id: string) => {
    if (clientReceives.length <= 1) return
    setClientReceives(clientReceives.filter(l => l.id !== id))
  }
  
  // Найти курс для пары валют (с учётом обратного курса)
  const findRateForPair = useCallback((fromCurrency: string, toCurrency: string): { rate: ExchangeRate | undefined, isReverse: boolean } => {
    // Прямой курс
    const directRate = exchangeRates.find(r => 
      r.from_currency === fromCurrency && 
      r.to_currency === toCurrency &&
      r.is_active
    )
    if (directRate) return { rate: directRate, isReverse: false }
    
    // Обратный курс
    const reverseRate = exchangeRates.find(r => 
      r.from_currency === toCurrency && 
      r.to_currency === fromCurrency &&
      r.is_active
    )
    return { rate: reverseRate, isReverse: true }
  }, [exchangeRates])
  
  // Рассчитать сумму к выдаче на основе суммы от клиента
  const calculateReceiveAmount = useCallback((giveAmount: number, giveCurrency: string, receiveCurrency: string): number => {
    if (giveAmount <= 0) return 0
    
    const { rate, isReverse } = findRateForPair(giveCurrency, receiveCurrency)
    if (!rate) return 0
    
    // В зависимости от метода расчета
    // Клиент отдает -> мы покупаем по buy_rate
    // Клиент получает -> мы продаем по sell_rate
    if (isReverse) {
      // Обратный курс: from_currency = receiveCurrency, to_currency = giveCurrency
      // Клиент отдает giveCurrency, получает receiveCurrency
      // sell_rate = сколько receiveCurrency за 1 giveCurrency при продаже нами
      return giveAmount * rate.sell_rate
    } else {
      // Прямой курс: from_currency = giveCurrency, to_currency = receiveCurrency  
      // buy_rate = сколько receiveCurrency за 1 giveCurrency при покупке у клиента
      return giveAmount * rate.buy_rate
    }
  }, [findRateForPair])
  
  // Обновить строку "Клиент отдает" + автоматически пересчитать "Клиент получает"
  const updateGiveLine = (id: string, field: keyof ExchangeLine, value: string) => {
    const newGives = clientGives.map(l => 
      l.id === id ? { ...l, [field]: value, ...(field === 'currency' ? { cashboxId: '' } : {}) } : l
    )
    setClientGives(newGives)
    
    // Автопересчет при изменении суммы или валюты
    if (field === 'amount' || field === 'currency') {
      const updatedLine = newGives.find(l => l.id === id)
      if (updatedLine && clientReceives.length === 1 && newGives.length === 1) {
        // Простой обмен 1 к 1 - автоматически пересчитываем
        const giveAmount = parseFloat(field === 'amount' ? value : updatedLine.amount) || 0
        const giveCurrency = field === 'currency' ? value : updatedLine.currency
        const receiveCurrency = clientReceives[0].currency
        
        if (giveAmount > 0 && giveCurrency !== receiveCurrency) {
          const receiveAmount = calculateReceiveAmount(giveAmount, giveCurrency, receiveCurrency)
          if (receiveAmount > 0) {
            setClientReceives(prev => prev.map((l, i) => 
              i === 0 ? { ...l, amount: receiveAmount.toFixed(2) } : l
            ))
          }
        }
      }
    }
  }
  
  const updateReceiveLine = (id: string, field: keyof ExchangeLine, value: string) => {
    setClientReceives(clientReceives.map(l => 
      l.id === id ? { ...l, [field]: value, ...(field === 'currency' ? { cashboxId: '' } : {}) } : l
    ))
  }
  
  // Текстовое описание метода расчета
  const getMethodDescription = (method: string) => {
    switch (method) {
      case 'auto': return 'Авто (API vs Ручной)'
      case 'manual': return 'Ручной (Покупка vs Продажа)'
      case 'fixed_percent': return 'Фикс. процент'
      default: return method
    }
  }
  
  // Получить курс из API
  const fetchRateFromAPI = async (fromCurr: string, toCurr: string): Promise<number | null> => {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurr}`)
      if (res.ok) {
        const data = await res.json()
        if (data.rates?.[toCurr]) {
          return data.rates[toCurr]
        }
      }
      return null
    } catch {
      return null
    }
  }
  
  // Открыть диалог редактирования курса
  const openRateDialog = async (rate: ExchangeRate) => {
    setSelectedRate(rate)
    setEditProfitMethod(rate.profit_calculation_method || 'auto')
    setEditFixedBaseSource(rate.fixed_base_source || 'api')
    setEditMarginPercent(rate.margin_percent?.toString() || '2.0')
    setEditBuyRate(rate.buy_rate.toString())
    setEditSellRate(rate.sell_rate.toString())
    
    // Загрузим актуальный курс API
    const apiRateValue = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
    setEditApiRate(apiRateValue)
    
    setIsRateDialogOpen(true)
  }
  
  // Сохранить изменения курса
  const saveRateChanges = async () => {
    if (!selectedRate) return
    
    setIsSavingRate(true)
    try {
      let finalBuyRate = parseFloat(editBuyRate) || 0
      let finalSellRate = parseFloat(editSellRate) || 0
      const margin = parseFloat(editMarginPercent) || 2.0
      
      // Расчет курсов в зависимости от метода
      if (editProfitMethod === 'auto') {
        if (editApiRate) {
          finalBuyRate = editApiRate
        }
      } else if (editProfitMethod === 'fixed_percent') {
        const baseRate = editFixedBaseSource === 'api' && editApiRate ? editApiRate : parseFloat(editBuyRate) || 0
        finalBuyRate = baseRate
        finalSellRate = baseRate * (1 + margin / 100)
      }
      
      const { error } = await supabase
        .from('exchange_rates')
        .update({
          buy_rate: finalBuyRate,
          sell_rate: finalSellRate,
          profit_calculation_method: editProfitMethod,
          fixed_base_source: editFixedBaseSource,
          margin_percent: margin,
          api_rate: editApiRate,
          api_rate_updated_at: editApiRate ? new Date().toISOString() : null,
          market_rate: editApiRate || finalBuyRate,
          last_updated: new Date().toISOString()
        })
        .eq('id', selectedRate.id)
      
      if (error) throw error
      
      toast.success('Курс обновлен')
      setIsRateDialogOpen(false)
      setSelectedRate(null)
      loadData()
    } catch (err) {
      toast.error('Ошибка сохранения курса')
    } finally {
      setIsSavingRate(false)
    }
  }
  
  // Расчет общей суммы в базовой валюте (USD) по рыночному курсу
  const calculateTotalInBase = useCallback((lines: ExchangeLine[], _direction: 'give' | 'receive'): number => {
    let total = 0
    const baseCurrency = settings?.base_currency || 'USD'
    
    for (const line of lines) {
      const amount = parseFloat(line.amount) || 0
      if (amount === 0) continue
      
      if (line.currency === baseCurrency) {
        total += amount
      } else {
        // Конвертируем в базовую валюту по рыночному/API курсу
        const rate = getRate(line.currency, baseCurrency)
        if (rate) {
          // Используем market_rate или buy_rate (API курс) для конвертации
          const marketRate = rate.market_rate || rate.buy_rate
          total += amount * marketRate
        } else {
          // Попробуем обратный курс (например USD/RUB для конвертации RUB в USD)
          const reverseRate = getRate(baseCurrency, line.currency)
          if (reverseRate) {
            // Для конвертации RUB->USD при курсе USD/RUB=76.9343: 7500 / 76.9343 = 97.48 USD
            const marketRate = reverseRate.market_rate || reverseRate.buy_rate
            total += amount / marketRate
          }
        }
      }
    }
    
    return total
  }, [settings, getRate])
  
  // Расчет прибыли
  // Прибыль = Рыночная стоимость того что дал клиент - Рыночная стоимость того что получил клиент
  // Пример: Клиент дал 100 USD, получил 7500 RUB при курсе 76.9343
  // givesInBase = 100 USD
  // receivesInBase = 7500 / 76.9343 = 97.48 USD (рыночная стоимость RUB)
  // profit = 100 - 97.48 = 2.52 USD (мы заработали, т.к. отдали меньше по рыночной стоимости)
  const calculatedProfit = useMemo(() => {
    const givesInBase = calculateTotalInBase(clientGives, 'give')
    const receivesInBase = calculateTotalInBase(clientReceives, 'receive')
    
    // Прибыль = то что клиент дал - то что клиент получил (в базовой валюте по рыночному курсу)
    return givesInBase - receivesInBase
  }, [clientGives, clientReceives, calculateTotalInBase])
  
  // Автозаполнение кассы при выборе валюты
  useEffect(() => {
    setClientGives(prev => prev.map(line => {
      if (!line.cashboxId) {
        const cboxes = getCashboxesForCurrency(line.currency)
        if (cboxes.length > 0) {
          return { ...line, cashboxId: cboxes[0].id }
        }
      }
      return line
    }))
  }, [clientGives.map(l => l.currency).join(','), getCashboxesForCurrency])
  
  useEffect(() => {
    setClientReceives(prev => prev.map(line => {
      if (!line.cashboxId) {
        const cboxes = getCashboxesForCurrency(line.currency)
        if (cboxes.length > 0) {
          return { ...line, cashboxId: cboxes[0].id }
        }
      }
      return line
    }))
  }, [clientReceives.map(l => l.currency).join(','), getCashboxesForCurrency])
  
  // Проверка валидности
  const isValid = useMemo(() => {
    // Все строки должны иметь сумму и кассу
    const givesValid = clientGives.every(l => 
      parseFloat(l.amount) > 0 && l.cashboxId
    )
    const receivesValid = clientReceives.every(l => 
      parseFloat(l.amount) > 0 && l.cashboxId
    )
    
    // Проверка баланса касс на выдачу
    const balancesOk = clientReceives.every(l => {
      const amount = parseFloat(l.amount) || 0
      const cashbox = cashboxes.find(c => c.id === l.cashboxId)
      return cashbox && cashbox.balance >= amount
    })
    
    return givesValid && receivesValid && balancesOk
  }, [clientGives, clientReceives, cashboxes])
  
  // Отправка операции
  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('Проверьте заполнение всех полей и баланс касс')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const baseCurrency = settings?.base_currency || 'USD'
      const givesInBase = calculateTotalInBase(clientGives, 'give')
      const receivesInBase = calculateTotalInBase(clientReceives, 'receive')
      
      // 1. Создаем основную операцию
      const { data: operation, error: opError } = await supabase
        .from('client_exchange_operations')
        .insert({
          operation_number: '', // Заполнится триггером
          total_client_gives_usd: givesInBase,
          total_client_receives_usd: receivesInBase,
          profit_amount: calculatedProfit,
          profit_currency: baseCurrency,
          client_name: clientName || null,
          client_phone: clientPhone || null,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (opError) throw opError
      
      // 2. Создаем детали - что клиент дает
      for (const line of clientGives) {
        const amount = parseFloat(line.amount)
        const rate = getRate(line.currency, baseCurrency)
        
        await supabase.from('client_exchange_details').insert({
          operation_id: operation.id,
          direction: 'give',
          currency: line.currency,
          amount: amount,
          applied_rate: rate?.buy_rate || null,
          market_rate: rate?.market_rate || null,
          cashbox_id: line.cashboxId,
          amount_in_base: line.currency === baseCurrency ? amount : (rate ? amount * rate.buy_rate : null)
        })
        
        // Увеличиваем баланс кассы (мы получаем от клиента)
        await supabase.rpc('update_cashbox_balance', {
          p_cashbox_id: line.cashboxId,
          p_amount: amount
        })
        
        // Создаем транзакцию
        await supabase.from('transactions').insert({
          cashbox_id: line.cashboxId,
          amount: amount,
          category: 'EXCHANGE_IN',
          description: `Клиентский обмен ${operation.operation_number}: получено ${amount} ${line.currency}`,
          reference_id: operation.id
        })
      }
      
      // 3. Создаем детали - что клиент получает
      for (const line of clientReceives) {
        const amount = parseFloat(line.amount)
        const rate = getRate(baseCurrency, line.currency)
        
        await supabase.from('client_exchange_details').insert({
          operation_id: operation.id,
          direction: 'receive',
          currency: line.currency,
          amount: amount,
          applied_rate: rate?.sell_rate || null,
          market_rate: rate?.market_rate || null,
          cashbox_id: line.cashboxId,
          amount_in_base: line.currency === baseCurrency ? amount : (rate ? amount / rate.sell_rate : null)
        })
        
        // Уменьшаем баланс кассы (мы отдаем клиенту)
        await supabase.rpc('update_cashbox_balance', {
          p_cashbox_id: line.cashboxId,
          p_amount: -amount
        })
        
        // Создаем транзакцию
        await supabase.from('transactions').insert({
          cashbox_id: line.cashboxId,
          amount: -amount,
          category: 'EXCHANGE_OUT',
          description: `Клиентский обмен ${operation.operation_number}: выдано ${amount} ${line.currency}`,
          reference_id: operation.id
        })
      }
      
      toast.success(`Обмен ${operation.operation_number} выполнен!`)
      
      // Сброс формы
      setClientGives([{ id: nanoid(), currency: 'USD', amount: '', cashboxId: '' }])
      setClientReceives([{ id: nanoid(), currency: 'RUB', amount: '', cashboxId: '' }])
      setClientName('')
      setClientPhone('')
      
      // Обновляем данные
      loadData()
      setRefreshKey(k => k + 1)
      
    } catch (error) {
      toast.error('Ошибка при выполнении обмена')
    } finally {
      setIsSubmitting(false)
    }
  }
  
// Поменять местами "Клиент отдает" и "Клиент получает"
  const swapGivesAndReceives = () => {
    const tempGives = [...clientGives]
    const tempReceives = [...clientReceives]
    setClientGives(tempReceives)
    setClientReceives(tempGives)
  }
  
  // Сброс формы
  const resetForm = () => {
    setClientGives([{ id: nanoid(), currency: 'USD', amount: '', cashboxId: '' }])
    setClientReceives([{ id: nanoid(), currency: 'RUB', amount: '', cashboxId: '' }])
    setClientName('')
    setClientPhone('')
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <Home className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <ArrowLeftRight className="h-6 w-6 text-cyan-400" />
                  Обмен валют
                </h1>
                <p className="text-sm text-muted-foreground">Клиентские операции обмена (мультивалюта)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link href="/settings?tab=exchange">
                <Button variant="outline" size="icon" className="bg-transparent">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="exchange" className="gap-2">
              <Calculator className="h-4 w-4" />
              Обмен
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Курсы
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              История
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="exchange" className="space-y-6">
            {/* Статистика за день */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/20">
                      <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Операций сегодня</p>
                      <p className="text-2xl font-bold font-mono">{todayStats.count}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Banknote className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Оборот ({settings?.base_currency || 'USD'})</p>
                      <p className="text-2xl font-bold font-mono">
                        {todayStats.volume.toLocaleString('ru-RU', { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Прибыль ({settings?.base_currency || 'USD'})</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400">
                        +{todayStats.profit.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Форма мультивалютного обмена */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
              {/* Кнопка обмена между блоками */}
              <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={swapGivesAndReceives}
                  className="rounded-full h-12 w-12 bg-background border-2 border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10 shadow-lg"
                  title="Поменять местами"
                >
                  <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                </Button>
              </div>
              
              {/* Кнопка обмена для мобильных */}
              <div className="flex lg:hidden justify-center -my-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={swapGivesAndReceives}
                  className="bg-transparent border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10"
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2 text-cyan-400" />
                  Поменять местами
                </Button>
              </div>
              
              {/* Клиент ОТДАЕТ */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ArrowDown className="h-5 w-5 text-emerald-400" />
                    Клиент отдает
                    <span className="text-xs font-normal text-muted-foreground ml-2">(мы покупаем)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientGives.map((line, index) => {
                    // Найдем применяемый курс для отображения
                    const receiveCurrency = clientReceives[0]?.currency
                    const { rate: appliedRate, isReverse } = receiveCurrency 
                      ? findRateForPair(line.currency, receiveCurrency)
                      : { rate: undefined, isReverse: false }
                    const displayRate = appliedRate 
                      ? (isReverse ? appliedRate.sell_rate : appliedRate.buy_rate)
                      : null
                    
                    return (
                      <div key={line.id} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Select 
                              value={line.currency} 
                              onValueChange={(v) => updateGiveLine(line.id, 'currency', v)}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCurrencies.map(c => (
                                  <SelectItem key={c} value={c}>
                                    <span className="flex items-center gap-2">
                                      <span>{CURRENCY_FLAGS[c] || ''}</span>
                                      <span>{c}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="text"
                              placeholder="0.00"
                              value={line.amount}
                              onChange={(e) => updateGiveLine(line.id, 'amount', e.target.value)}
                              className="flex-1 text-lg font-mono text-right"
                            />
                          </div>
                          {/* Показываем применяемый курс */}
                          {displayRate && receiveCurrency && line.currency !== receiveCurrency && (
                            <div className="flex items-center justify-between px-2 py-1 rounded bg-secondary/30 text-xs">
                              <span className="text-muted-foreground">
                                Курс: 1 {line.currency} = {displayRate.toFixed(4)} {receiveCurrency}
                              </span>
                              {appliedRate && (
                                <span className={`px-1.5 py-0.5 rounded ${
                                  appliedRate.profit_calculation_method === 'auto' 
                                    ? 'bg-cyan-500/20 text-cyan-400' 
                                    : appliedRate.profit_calculation_method === 'fixed_percent'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-secondary text-muted-foreground'
                                }`}>
                                  {appliedRate.profit_calculation_method === 'auto' ? 'Авто' : 
                                   appliedRate.profit_calculation_method === 'fixed_percent' ? `${appliedRate.margin_percent}%` : 'Ручн.'}
                                </span>
                              )}
                            </div>
                          )}
                          <Select 
                            value={line.cashboxId} 
                            onValueChange={(v) => updateGiveLine(line.id, 'cashboxId', v)}
                          >
                            <SelectTrigger className="text-sm h-8">
                              <SelectValue placeholder="Выберите кассу" />
                            </SelectTrigger>
                            <SelectContent>
                              {getCashboxesForCurrency(line.currency).map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center justify-between w-full gap-4">
                                    <span>{c.name}</span>
                                    <span className="text-muted-foreground font-mono text-xs">
                                      {Number(c.balance).toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[c.currency] || c.currency}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {clientGives.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 text-muted-foreground hover:text-destructive"
                            onClick={() => removeGiveLine(line.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  
                  {clientGives.length < 6 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full bg-transparent"
                      onClick={addGiveLine}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить валюту
                    </Button>
                  )}
                </CardContent>
              </Card>
              
              {/* Клиент ПОЛУЧАЕТ */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ArrowUp className="h-5 w-5 text-red-400" />
                    Клиент получает
                    <span className="text-xs font-normal text-muted-foreground ml-2">(мы продаем)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientReceives.map((line, index) => {
                    const cashbox = cashboxes.find(c => c.id === line.cashboxId)
                    const amount = parseFloat(line.amount) || 0
                    const insufficientBalance = cashbox && cashbox.balance < amount
                    
                    // Покажем откуда взялась сумма
                    const giveCurrency = clientGives[0]?.currency
                    const giveAmount = parseFloat(clientGives[0]?.amount) || 0
                    
                    return (
                      <div key={line.id} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Select 
                              value={line.currency} 
                              onValueChange={(v) => {
                                updateReceiveLine(line.id, 'currency', v)
                                // Пересчитать сумму при смене валюты
                                if (clientGives.length === 1 && clientReceives.length === 1 && giveAmount > 0) {
                                  const newAmount = calculateReceiveAmount(giveAmount, giveCurrency, v)
                                  if (newAmount > 0) {
                                    setTimeout(() => {
                                      setClientReceives(prev => prev.map((l, i) => 
                                        i === 0 ? { ...l, amount: newAmount.toFixed(2) } : l
                                      ))
                                    }, 0)
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableCurrencies.map(c => (
                                  <SelectItem key={c} value={c}>
                                    <span className="flex items-center gap-2">
                                      <span>{CURRENCY_FLAGS[c] || ''}</span>
                                      <span>{c}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex-1 relative">
                              <Input
                                type="text"
                                placeholder="Авто"
                                value={line.amount}
                                onChange={(e) => updateReceiveLine(line.id, 'amount', e.target.value)}
                                className={`text-lg font-mono text-right pr-16 ${insufficientBalance ? 'border-red-500' : ''}`}
                              />
                              {clientGives.length === 1 && clientReceives.length === 1 && giveAmount > 0 && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyan-400">
                                  авто
                                </span>
                              )}
                            </div>
                          </div>
                          <Select 
                            value={line.cashboxId} 
                            onValueChange={(v) => updateReceiveLine(line.id, 'cashboxId', v)}
                          >
                            <SelectTrigger className={`text-sm h-8 ${insufficientBalance ? 'border-red-500' : ''}`}>
                              <SelectValue placeholder="Выберите кассу" />
                            </SelectTrigger>
                            <SelectContent>
                              {getCashboxesForCurrency(line.currency).map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center justify-between w-full gap-4">
                                    <span>{c.name}</span>
                                    <span className={`font-mono text-xs ${c.balance < amount ? 'text-red-400' : 'text-muted-foreground'}`}>
                                      {Number(c.balance).toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[c.currency] || c.currency}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {insufficientBalance && (
                            <p className="text-xs text-red-400">Недостаточно средств в кассе</p>
                          )}
                        </div>
                        {clientReceives.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 text-muted-foreground hover:text-destructive"
                            onClick={() => removeReceiveLine(line.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  
                  {clientReceives.length < 6 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full bg-transparent"
                      onClick={addReceiveLine}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить валюту
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Итого и действия */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                  {/* Данные клиента */}
                  <div className="flex gap-4 flex-1">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Имя клиента</Label>
                      <Input
                        placeholder="Необязательно"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Телефон</Label>
                      <Input
                        placeholder="Необязательно"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  {/* Прибыль */}
                  <div className="text-center px-6 py-2 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Прибыль</p>
                    <p className={`text-xl font-bold font-mono ${calculatedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {calculatedProfit >= 0 ? '+' : ''}{calculatedProfit.toFixed(2)} {settings?.base_currency || 'USD'}
                    </p>
                  </div>
                  
                  {/* Кнопки */}
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={resetForm}
                      className="bg-transparent"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Сбросить
                    </Button>
                    <Button 
                      onClick={handleSubmit}
                      disabled={!isValid || isSubmitting}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Выполнить обмен
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Панель текущих курсов и методов расчета */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    Активные курсы и методы расчета
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={loadData}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {exchangeRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Нет активных курсов. Настройте курсы во вкладке "Курсы"
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {exchangeRates.filter(r => r.is_active).map(rate => {
                      const margin = rate.buy_rate && rate.sell_rate 
                        ? ((rate.sell_rate - rate.buy_rate) / rate.buy_rate * 100).toFixed(2)
                        : '0'
                      return (
                        <div 
                          key={rate.id} 
                          onClick={() => openRateDialog(rate)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer hover:scale-[1.02] ${
                            rate.is_popular 
                              ? 'border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50' 
                              : 'border-border hover:border-cyan-500/30 hover:bg-cyan-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm text-foreground">
                              {CURRENCY_FLAGS[rate.from_currency] || ''} {rate.from_currency} → {CURRENCY_FLAGS[rate.to_currency] || ''} {rate.to_currency}
                            </span>
                            {rate.is_popular && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">TOP</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            <div>
                              <span className="text-muted-foreground">Покупка: </span>
                              <span className="font-mono text-green-400">{rate.buy_rate.toFixed(4)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Продажа: </span>
                              <span className="font-mono text-red-400">{rate.sell_rate.toFixed(4)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={`px-1.5 py-0.5 rounded ${
                              rate.profit_calculation_method === 'auto' 
                                ? 'bg-cyan-500/20 text-cyan-400' 
                                : rate.profit_calculation_method === 'fixed_percent'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-secondary text-muted-foreground'
                            }`}>
                              {getMethodDescription(rate.profit_calculation_method || 'manual')}
                            </span>
                            <span className="font-mono text-emerald-400">+{margin}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="rates">
            <ExchangeRatesManager rates={exchangeRates} onUpdate={loadData} />
          </TabsContent>
          
          <TabsContent value="history">
            <ExchangeHistoryList refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
        
        {/* Диалог редактирования курса */}
        <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedRate && (
                  <>
                    <span>{CURRENCY_FLAGS[selectedRate.from_currency] || ''}</span>
                    <span className="font-mono">{selectedRate.from_currency}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span>{CURRENCY_FLAGS[selectedRate.to_currency] || ''}</span>
                    <span className="font-mono">{selectedRate.to_currency}</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                Настройка метода расчета и курсов для валютной пары
              </DialogDescription>
            </DialogHeader>
            
            {selectedRate && (
              <div className="space-y-4 py-2">
                {/* Текущий курс API */}
                {editApiRate && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Текущий курс API:</span>
                      <span className="font-mono font-bold text-cyan-400">{editApiRate.toFixed(4)}</span>
                    </div>
                  </div>
                )}
                
                {/* Выбор метода расчета */}
                <div className="space-y-2">
                  <Label>Метод расчета прибыли</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div 
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                        editProfitMethod === 'auto' 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setEditProfitMethod('auto')}
                    >
                      <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${editProfitMethod === 'auto' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">Авто</span>
                      <p className="text-xs text-muted-foreground mt-1">API vs Ручной</p>
                    </div>
                    <div 
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                        editProfitMethod === 'manual' 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setEditProfitMethod('manual')}
                    >
                      <Pencil className={`h-5 w-5 mx-auto mb-1 ${editProfitMethod === 'manual' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">Ручной</span>
                      <p className="text-xs text-muted-foreground mt-1">Покупка vs Продажа</p>
                    </div>
                    <div 
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                        editProfitMethod === 'fixed_percent' 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setEditProfitMethod('fixed_percent')}
                    >
                      <Calculator className={`h-5 w-5 mx-auto mb-1 ${editProfitMethod === 'fixed_percent' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">Фикс %</span>
                      <p className="text-xs text-muted-foreground mt-1">Базовый + %</p>
                    </div>
                  </div>
                </div>
                
                {/* Настройки для fixed_percent */}
                {editProfitMethod === 'fixed_percent' && (
                  <div className="space-y-3 p-3 rounded-lg bg-secondary/30">
                    <div className="space-y-2">
                      <Label>Источник базового курса</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div 
                          className={`p-2 rounded border cursor-pointer text-center ${
                            editFixedBaseSource === 'api' 
                              ? 'border-cyan-500 bg-cyan-500/10' 
                              : 'border-border'
                          }`}
                          onClick={() => setEditFixedBaseSource('api')}
                        >
                          <span className="text-sm">Из API</span>
                        </div>
                        <div 
                          className={`p-2 rounded border cursor-pointer text-center ${
                            editFixedBaseSource === 'manual' 
                              ? 'border-cyan-500 bg-cyan-500/10' 
                              : 'border-border'
                          }`}
                          onClick={() => setEditFixedBaseSource('manual')}
                        >
                          <span className="text-sm">Вручную</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Процент маржи (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editMarginPercent}
                        onChange={(e) => setEditMarginPercent(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                
                {/* Поля курсов */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      {editProfitMethod === 'auto' ? 'Курс продажи (вручную)' : 
                       editProfitMethod === 'fixed_percent' && editFixedBaseSource === 'api' ? 'Курс покупки (из API)' :
                       'Курс покупки'}
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={editBuyRate}
                      onChange={(e) => setEditBuyRate(e.target.value)}
                      disabled={editProfitMethod === 'fixed_percent' && editFixedBaseSource === 'api'}
                      className={editProfitMethod === 'fixed_percent' && editFixedBaseSource === 'api' ? 'opacity-50' : ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {editProfitMethod === 'auto' ? 'Курс покупки (из API)' : 
                       editProfitMethod === 'fixed_percent' ? 'Курс продажи (авто)' :
                       'Курс продажи'}
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={editSellRate}
                      onChange={(e) => setEditSellRate(e.target.value)}
                      disabled={editProfitMethod === 'auto' || editProfitMethod === 'fixed_percent'}
                      className={editProfitMethod === 'auto' || editProfitMethod === 'fixed_percent' ? 'opacity-50' : ''}
                    />
                  </div>
                </div>
                
                {/* Расчет маржи */}
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Расчетная маржа:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {(() => {
                        const buy = editProfitMethod === 'auto' ? (editApiRate || 0) : parseFloat(editBuyRate) || 0
                        const sell = parseFloat(editSellRate) || 0
                        if (buy && sell && buy > 0) {
                          return `${((sell - buy) / buy * 100).toFixed(2)}%`
                        }
                        return '—'
                      })()}
                    </span>
                  </div>
                </div>
                
                {/* Кнопки */}
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 bg-transparent"
                    onClick={() => setIsRateDialogOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={saveRateChanges}
                    disabled={isSavingRate}
                  >
                    {isSavingRate ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Сохранить
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
