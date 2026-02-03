'use client'

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
  Calculator, RefreshCw, Plus, Trash2, Check,
  Banknote, Home, ArrowDown, ArrowUp, X
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate, ExchangeSettings, Cashbox } from '@/lib/types/database'
import { ExchangeRatesManager } from '@/components/exchange/exchange-rates-manager'
import { ExchangeHistoryList } from '@/components/exchange/exchange-history-list'
import { ExchangeSettingsDialog } from '@/components/exchange/exchange-settings-dialog'

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
    { id: crypto.randomUUID(), currency: 'USD', amount: '', cashboxId: '' }
  ])
  const [clientReceives, setClientReceives] = useState<ExchangeLine[]>([
    { id: crypto.randomUUID(), currency: 'RUB', amount: '', cashboxId: '' }
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
      id: crypto.randomUUID(), 
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
      id: crypto.randomUUID(), 
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
  
  // Обновить строку
  const updateGiveLine = (id: string, field: keyof ExchangeLine, value: string) => {
    setClientGives(clientGives.map(l => 
      l.id === id ? { ...l, [field]: value, ...(field === 'currency' ? { cashboxId: '' } : {}) } : l
    ))
  }
  
  const updateReceiveLine = (id: string, field: keyof ExchangeLine, value: string) => {
    setClientReceives(clientReceives.map(l => 
      l.id === id ? { ...l, [field]: value, ...(field === 'currency' ? { cashboxId: '' } : {}) } : l
    ))
  }
  
  // Расчет общей суммы в базовой валюте (USD)
  const calculateTotalInBase = useCallback((lines: ExchangeLine[], direction: 'give' | 'receive'): number => {
    let total = 0
    const baseCurrency = settings?.base_currency || 'USD'
    
    for (const line of lines) {
      const amount = parseFloat(line.amount) || 0
      if (amount === 0) continue
      
      if (line.currency === baseCurrency) {
        total += amount
      } else {
        // Конвертируем в базовую валюту
        const rate = getRate(line.currency, baseCurrency)
        if (rate) {
          // Используем buy_rate если клиент дает, sell_rate если получает
          const useRate = direction === 'give' ? rate.buy_rate : rate.sell_rate
          total += amount * useRate
        } else {
          // Попробуем обратный курс
          const reverseRate = getRate(baseCurrency, line.currency)
          if (reverseRate) {
            const useRate = direction === 'give' ? reverseRate.sell_rate : reverseRate.buy_rate
            total += amount / useRate
          }
        }
      }
    }
    
    return total
  }, [settings, getRate])
  
  // Расчет прибыли
  const calculatedProfit = useMemo(() => {
    const givesInBase = calculateTotalInBase(clientGives, 'give')
    const receivesInBase = calculateTotalInBase(clientReceives, 'receive')
    
    // Прибыль = то что клиент дал - то что клиент получил (в базовой валюте)
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
      setClientGives([{ id: crypto.randomUUID(), currency: 'USD', amount: '', cashboxId: '' }])
      setClientReceives([{ id: crypto.randomUUID(), currency: 'RUB', amount: '', cashboxId: '' }])
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
  
  // Сброс формы
  const resetForm = () => {
    setClientGives([{ id: crypto.randomUUID(), currency: 'USD', amount: '', cashboxId: '' }])
    setClientReceives([{ id: crypto.randomUUID(), currency: 'RUB', amount: '', cashboxId: '' }])
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
              <ExchangeSettingsDialog settings={settings} onSave={loadData}>
                <Button variant="outline" size="icon" className="bg-transparent">
                  <Settings className="h-5 w-5" />
                </Button>
              </ExchangeSettingsDialog>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Клиент ОТДАЕТ */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ArrowDown className="h-5 w-5 text-emerald-400" />
                    Клиент отдает
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientGives.map((line, index) => (
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
                  ))}
                  
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
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientReceives.map((line, index) => {
                    const cashbox = cashboxes.find(c => c.id === line.cashboxId)
                    const amount = parseFloat(line.amount) || 0
                    const insufficientBalance = cashbox && cashbox.balance < amount
                    
                    return (
                      <div key={line.id} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Select 
                              value={line.currency} 
                              onValueChange={(v) => updateReceiveLine(line.id, 'currency', v)}
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
                              onChange={(e) => updateReceiveLine(line.id, 'amount', e.target.value)}
                              className={`flex-1 text-lg font-mono text-right ${insufficientBalance ? 'border-red-500' : ''}`}
                            />
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
          </TabsContent>
          
          <TabsContent value="rates">
            <ExchangeRatesManager rates={exchangeRates} onUpdate={loadData} />
          </TabsContent>
          
          <TabsContent value="history">
            <ExchangeHistoryList refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
