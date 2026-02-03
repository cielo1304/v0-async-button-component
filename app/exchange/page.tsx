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
  ArrowLeftRight, ArrowUpDown, Settings, History, TrendingUp,
  Calculator, Wallet, RefreshCw, Check, Clock, ChevronDown,
  DollarSign, Banknote, ArrowRight, Home
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate, ClientExchange, ExchangeSettings, Cashbox } from '@/lib/types/database'
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

export default function ExchangePage() {
  const supabase = useMemo(() => createClient(), [])
  
  // Состояние формы обмена
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('RUB')
  const [fromAmount, setFromAmount] = useState<string>('')
  const [toAmount, setToAmount] = useState<string>('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [lastEditedField, setLastEditedField] = useState<'from' | 'to'>('from')
  
  // Данные клиента
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  
  // Данные из БД
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [settings, setSettings] = useState<ExchangeSettings | null>(null)
  const [todayStats, setTodayStats] = useState<{ count: number; volume: number; profit: number }>({ count: 0, volume: 0, profit: 0 })
  
  // Выбор касс для операции
  const [fromCashboxId, setFromCashboxId] = useState<string>('')
  const [toCashboxId, setToCashboxId] = useState<string>('')
  
  // Состояние UI
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('exchange')
  
  // Текущий курс для выбранной пары
  const currentRate = useMemo(() => {
    return exchangeRates.find(r => 
      r.from_currency === fromCurrency && 
      r.to_currency === toCurrency &&
      r.is_active
    )
  }, [exchangeRates, fromCurrency, toCurrency])
  
  // Обратный курс
  const reverseRate = useMemo(() => {
    return exchangeRates.find(r => 
      r.from_currency === toCurrency && 
      r.to_currency === fromCurrency &&
      r.is_active
    )
  }, [exchangeRates, fromCurrency, toCurrency])
  
  // Доступные валюты
  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>()
    exchangeRates.forEach(r => {
      currencies.add(r.from_currency)
      currencies.add(r.to_currency)
    })
    return Array.from(currencies).sort()
  }, [exchangeRates])
  
  // Кассы для выбранных валют
  const fromCashboxes = useMemo(() => {
    return cashboxes.filter(c => c.currency === fromCurrency && !c.is_archived)
  }, [cashboxes, fromCurrency])
  
  const toCashboxes = useMemo(() => {
    return cashboxes.filter(c => c.currency === toCurrency && !c.is_archived)
  }, [cashboxes, toCurrency])
  
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
      
      const { data: todayExchanges } = await supabase
        .from('client_exchanges')
        .select('from_amount, profit_in_base')
        .eq('status', 'completed')
        .gte('completed_at', startOfDay.toISOString())
      
      if (todayExchanges) {
        setTodayStats({
          count: todayExchanges.length,
          volume: todayExchanges.reduce((sum, e) => sum + Number(e.from_amount), 0),
          profit: todayExchanges.reduce((sum, e) => sum + Number(e.profit_in_base || 0), 0)
        })
      }
    } catch (error) {
      toast.error('Ошибка загрузки данных')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Автовыбор касс при смене валют
  useEffect(() => {
    if (fromCashboxes.length > 0 && !fromCashboxId) {
      setFromCashboxId(fromCashboxes[0].id)
    }
  }, [fromCashboxes, fromCashboxId])
  
  useEffect(() => {
    if (toCashboxes.length > 0 && !toCashboxId) {
      setToCashboxId(toCashboxes[0].id)
    }
  }, [toCashboxes, toCashboxId])
  
  // Расчет суммы
  const calculateAmount = useCallback((amount: string, direction: 'from' | 'to') => {
    if (!amount || !currentRate) {
      if (direction === 'from') setToAmount('')
      else setFromAmount('')
      return
    }
    
    const numAmount = parseFloat(amount.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (isNaN(numAmount)) return
    
    if (direction === 'from') {
      // Клиент дает fromCurrency, получает toCurrency
      // Мы покупаем у клиента -> используем buy_rate
      const result = numAmount * currentRate.sell_rate
      setToAmount(result.toFixed(2))
    } else {
      // Клиент хочет получить toCurrency
      // Считаем сколько нужно дать
      const result = numAmount / currentRate.sell_rate
      setFromAmount(result.toFixed(2))
    }
  }, [currentRate])
  
  // Обработка ввода суммы
  const handleFromAmountChange = (value: string) => {
    setFromAmount(value)
    setLastEditedField('from')
    calculateAmount(value, 'from')
  }
  
  const handleToAmountChange = (value: string) => {
    setToAmount(value)
    setLastEditedField('to')
    calculateAmount(value, 'to')
  }
  
  // Смена направления
  const swapCurrencies = () => {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
    setFromCashboxId(toCashboxId)
    setToCashboxId(fromCashboxId)
  }
  
  // Расчет прибыли
  const calculateProfit = useCallback(() => {
    if (!currentRate || !fromAmount) return { amount: 0, currency: settings?.base_currency || 'USD' }
    
    const numFromAmount = parseFloat(fromAmount)
    if (isNaN(numFromAmount)) return { amount: 0, currency: settings?.base_currency || 'USD' }
    
    // Прибыль = разница между рыночным курсом и нашим курсом
    const marketRate = currentRate.market_rate || currentRate.sell_rate
    const ourRate = currentRate.sell_rate
    
    // Прибыль в валюте получения
    const profitInToCurrency = numFromAmount * (ourRate - marketRate)
    
    return { 
      amount: Math.abs(profitInToCurrency), 
      currency: toCurrency 
    }
  }, [currentRate, fromAmount, toCurrency, settings])
  
  const profit = calculateProfit()
  
  // Отправка операции
  const handleSubmit = async () => {
    if (!fromAmount || !toAmount || !fromCashboxId || !toCashboxId || !currentRate) {
      toast.error('Заполните все поля')
      return
    }
    
    const numFromAmount = parseFloat(fromAmount)
    const numToAmount = parseFloat(toAmount)
    
    if (isNaN(numFromAmount) || isNaN(numToAmount)) {
      toast.error('Некорректная сумма')
      return
    }
    
    // Проверка минимальной суммы
    if (settings?.min_exchange_amount && numFromAmount < settings.min_exchange_amount) {
      toast.error(`Минимальная сумма обмена: ${settings.min_exchange_amount}`)
      return
    }
    
    // Проверка баланса кассы
    const toCashbox = cashboxes.find(c => c.id === toCashboxId)
    if (toCashbox && toCashbox.balance < numToAmount) {
      toast.error(`Недостаточно средств в кассе ${toCashbox.name}`)
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Создаем операцию обмена
      const { data: exchange, error: exchangeError } = await supabase
        .from('client_exchanges')
        .insert({
          from_currency: fromCurrency,
          to_currency: toCurrency,
          from_amount: numFromAmount,
          to_amount: numToAmount,
          applied_rate: currentRate.sell_rate,
          market_rate: currentRate.market_rate,
          profit_amount: profit.amount,
          profit_currency: profit.currency,
          from_cashbox_id: fromCashboxId,
          to_cashbox_id: toCashboxId,
          client_name: clientName || null,
          client_phone: clientPhone || null,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (exchangeError) throw exchangeError
      
      // Обновляем балансы касс
      // Касса "от" (получаем от клиента) - увеличиваем
      const { error: fromError } = await supabase.rpc('update_cashbox_balance', {
        p_cashbox_id: fromCashboxId,
        p_amount: numFromAmount
      })
      
      // Касса "к" (отдаем клиенту) - уменьшаем
      const { error: toError } = await supabase.rpc('update_cashbox_balance', {
        p_cashbox_id: toCashboxId,
        p_amount: -numToAmount
      })
      
      // Создаем транзакции в обеих кассах
      await Promise.all([
        supabase.from('transactions').insert({
          cashbox_id: fromCashboxId,
          amount: numFromAmount,
          category: 'EXCHANGE_IN',
          description: `Обмен от клиента: ${numFromAmount} ${fromCurrency} → ${numToAmount} ${toCurrency}`,
          reference_id: exchange.id
        }),
        supabase.from('transactions').insert({
          cashbox_id: toCashboxId,
          amount: -numToAmount,
          category: 'EXCHANGE_OUT',
          description: `Обмен клиенту: ${numFromAmount} ${fromCurrency} → ${numToAmount} ${toCurrency}`,
          reference_id: exchange.id
        })
      ])
      
      toast.success('Обмен выполнен успешно!')
      
      // Сброс формы
      setFromAmount('')
      setToAmount('')
      setClientName('')
      setClientPhone('')
      
      // Обновляем данные
      loadData()
      
    } catch (error) {
      toast.error('Ошибка при выполнении обмена')
    } finally {
      setIsSubmitting(false)
    }
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
                <p className="text-sm text-muted-foreground">Клиентские операции обмена</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Статистика за день */}
              <div className="lg:col-span-3 grid grid-cols-3 gap-4">
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
                        <p className="text-xs text-muted-foreground">Оборот</p>
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
              
              {/* Форма обмена */}
              <div className="lg:col-span-2">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-cyan-400" />
                      Новый обмен
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Валюты и суммы */}
                    <div className="space-y-4">
                      {/* Отдает клиент */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Клиент отдает</Label>
                        <div className="flex gap-2">
                          <Select value={fromCurrency} onValueChange={(v) => {
                            setFromCurrency(v)
                            setFromCashboxId('')
                          }}>
                            <SelectTrigger className="w-[140px]">
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
                            value={fromAmount}
                            onChange={(e) => handleFromAmountChange(e.target.value)}
                            className="flex-1 text-xl font-mono text-right"
                          />
                        </div>
                        {fromCashboxes.length > 0 && (
                          <Select value={fromCashboxId} onValueChange={setFromCashboxId}>
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Выберите кассу" />
                            </SelectTrigger>
                            <SelectContent>
                              {fromCashboxes.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center justify-between w-full gap-4">
                                    <span>{c.name}</span>
                                    <span className="text-muted-foreground font-mono">
                                      {c.balance.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[c.currency] || c.currency}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      
                      {/* Кнопка смены направления и курс */}
                      <div className="flex items-center justify-center gap-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={swapCurrencies}
                          className="rounded-full bg-transparent"
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                        
                        {currentRate && (
                          <div className="text-sm text-muted-foreground">
                            Курс: <span className="font-mono font-medium text-foreground">
                              1 {fromCurrency} = {currentRate.sell_rate.toFixed(4)} {toCurrency}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Получает клиент */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Клиент получает</Label>
                        <div className="flex gap-2">
                          <Select value={toCurrency} onValueChange={(v) => {
                            setToCurrency(v)
                            setToCashboxId('')
                          }}>
                            <SelectTrigger className="w-[140px]">
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
                            value={toAmount}
                            onChange={(e) => handleToAmountChange(e.target.value)}
                            className="flex-1 text-xl font-mono text-right"
                          />
                        </div>
                        {toCashboxes.length > 0 && (
                          <Select value={toCashboxId} onValueChange={setToCashboxId}>
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Выберите кассу" />
                            </SelectTrigger>
                            <SelectContent>
                              {toCashboxes.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center justify-between w-full gap-4">
                                    <span>{c.name}</span>
                                    <span className="text-muted-foreground font-mono">
                                      {c.balance.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[c.currency] || c.currency}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    
                    {/* Данные клиента */}
                    {settings?.require_client_info && (
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div className="space-y-2">
                          <Label>Имя клиента</Label>
                          <Input
                            placeholder="ФИО"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Телефон</Label>
                          <Input
                            placeholder="+7..."
                            value={clientPhone}
                            onChange={(e) => setClientPhone(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Прибыль */}
                    {profit.amount > 0 && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Прибыль с операции</span>
                          <span className="font-mono font-bold text-emerald-400">
                            +{profit.amount.toFixed(2)} {CURRENCY_SYMBOLS[profit.currency] || profit.currency}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Кнопка */}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !fromAmount || !toAmount || !fromCashboxId || !toCashboxId}
                    >
                      {isSubmitting ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Выполнить обмен
                    </Button>
                  </CardContent>
                </Card>
              </div>
              
              {/* Популярные курсы */}
              <div>
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-cyan-400" />
                      Популярные курсы
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {exchangeRates
                      .filter(r => r.is_popular)
                      .slice(0, 6)
                      .map(rate => (
                        <button
                          key={rate.id}
                          className="w-full p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-left"
                          onClick={() => {
                            setFromCurrency(rate.from_currency)
                            setToCurrency(rate.to_currency)
                            setFromCashboxId('')
                            setToCashboxId('')
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{CURRENCY_FLAGS[rate.from_currency] || ''}</span>
                              <span className="font-medium">{rate.from_currency}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span>{CURRENCY_FLAGS[rate.to_currency] || ''}</span>
                              <span className="font-medium">{rate.to_currency}</span>
                            </div>
                            <div className="font-mono text-sm">
                              {rate.sell_rate.toFixed(2)}
                            </div>
                          </div>
                        </button>
                      ))}
                    
                    {exchangeRates.filter(r => r.is_popular).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Нет популярных курсов
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="rates">
            <ExchangeRatesManager onUpdate={loadData} />
          </TabsContent>
          
          <TabsContent value="history">
            <ExchangeHistoryList />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
