'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, RefreshCw, Star, TrendingUp, ArrowRight, Wifi, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate, CurrencyRateSource } from '@/lib/types/database'

interface Props {
  onUpdate?: () => void
}

interface ExtendedExchangeRate extends ExchangeRate {
  is_auto_rate?: boolean
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
  'BTC': '₿',
  'ETH': 'Ξ',
  'USDT': '₮',
}

export function ExchangeRatesManager({ onUpdate }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [rates, setRates] = useState<ExtendedExchangeRate[]>([])
  const [rateSources, setRateSources] = useState<CurrencyRateSource[]>([])
  const [exchangeSettings, setExchangeSettings] = useState<{ 
    rate_update_interval_minutes: number
    default_margin_percent: number 
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingRate, setEditingRate] = useState<ExtendedExchangeRate | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAutoRate, setIsAutoRate] = useState(false) // Declared here

  // Форма
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [marketRate, setMarketRate] = useState('')
  const [isPopular, setIsPopular] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [profitMethod, setProfitMethod] = useState<'auto' | 'manual' | 'fixed_percent'>('auto')
  const [fixedBaseSource, setFixedBaseSource] = useState<'api' | 'manual'>('api')
  const [marginPercent, setMarginPercent] = useState('2.0')
  const [apiRate, setApiRate] = useState<number | null>(null)

  // Получить курс из API для валютной пары
  const fetchRateFromAPI = useCallback(async (fromCurr: string, toCurr: string): Promise<number | null> => {
    try {
      // Пробуем Exchange Rate API
      const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurr}`)
      if (res.ok) {
        const data = await res.json()
        if (data.rates?.[toCurr]) {
          return data.rates[toCurr]
        }
      }
      
      // Fallback для криптовалют через Binance
      const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'BNB', 'XRP']
      const isCryptoFrom = cryptoCurrencies.includes(fromCurr)
      const isCryptoTo = cryptoCurrencies.includes(toCurr)
      
      if (isCryptoFrom || isCryptoTo) {
        if (isCryptoFrom && toCurr === 'USD') {
          const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${fromCurr}USDT`)
          if (binanceRes.ok) {
            const data = await binanceRes.json()
            return parseFloat(data.price)
          }
        }
        if (isCryptoTo && fromCurr === 'USD') {
          const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${toCurr}USDT`)
          if (binanceRes.ok) {
            const data = await binanceRes.json()
            return 1 / parseFloat(data.price)
          }
        }
      }
      
      return null
    } catch {
      return null
    }
  }, [])

  const loadRates = useCallback(async () => {
    setIsLoading(true)
    try {
      const [ratesResult, sourcesResult, settingsResult] = await Promise.all([
        supabase
          .from('exchange_rates')
          .select('*')
          .order('sort_order'),
        supabase
          .from('currency_rate_sources')
          .select('*')
          .eq('is_active', true)
          .eq('is_default', true)
          .order('currency_code'),
        supabase
          .from('exchange_settings')
          .select('rate_update_interval_minutes, default_margin_percent')
          .limit(1)
          .single()
      ])
      
      if (ratesResult.error) throw ratesResult.error
      setRates(ratesResult.data || [])
      setRateSources(sourcesResult.data || [])
      if (settingsResult.data) {
        setExchangeSettings(settingsResult.data)
      }
    } catch {
      toast.error('Ошибка загрузки курсов')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // Автоматическое обновление курсов из API для пар с методами auto и fixed_percent
  const updateAutoRates = useCallback(async () => {
    // Обновляем пары с методами auto и fixed_percent (с источником api)
    const autoRates = rates.filter(r => 
      r.profit_calculation_method === 'auto' || 
      (r.profit_calculation_method === 'fixed_percent' && r.fixed_base_source === 'api')
    )
    if (autoRates.length === 0) return
    
    let updated = false
    for (const rate of autoRates) {
      const currentApiRate = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
      if (currentApiRate) {
        let newBuyRate = rate.buy_rate
        let newSellRate = rate.sell_rate
        
        if (rate.profit_calculation_method === 'auto') {
          // Авто: API курс = покупка, ручной курс продажи остается
          newBuyRate = currentApiRate
        } else if (rate.profit_calculation_method === 'fixed_percent') {
          // Фикс процент: базовый = API, продажа = базовый + маржа%
          const margin = rate.margin_percent || 2
          newBuyRate = currentApiRate
          newSellRate = currentApiRate * (1 + margin / 100)
        }
        
        await supabase
          .from('exchange_rates')
          .update({
            buy_rate: newBuyRate,
            sell_rate: newSellRate,
            api_rate: currentApiRate,
            api_rate_updated_at: new Date().toISOString(),
            market_rate: currentApiRate,
            last_updated: new Date().toISOString()
          })
          .eq('id', rate.id)
        
        updated = true
      }
    }
    
    if (updated) {
      loadRates()
    }
  }, [rates, fetchRateFromAPI, supabase, loadRates])

  useEffect(() => {
    loadRates()
  }, [loadRates])

  // Автообновление по интервалу из настроек
  useEffect(() => {
    if (!exchangeSettings?.rate_update_interval_minutes) return
    
    // Обновляем сразу при загрузке
    const timeout = setTimeout(() => {
      updateAutoRates()
    }, 2000)
    
    // Затем по интервалу
    const intervalMs = exchangeSettings.rate_update_interval_minutes * 60 * 1000
    const interval = setInterval(() => {
      updateAutoRates()
    }, intervalMs)
    
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [exchangeSettings?.rate_update_interval_minutes, updateAutoRates])
  
const resetForm = () => {
    setFromCurrency('')
    setToCurrency('')
    setBuyRate('')
    setSellRate('')
    setMarketRate('')
    setIsPopular(false)
    setIsActive(true)
    setProfitMethod('auto')
    setFixedBaseSource('api')
    setMarginPercent(exchangeSettings?.default_margin_percent?.toString() || '2.0')
    setApiRate(null)
    setEditingRate(null)
  }
  
const openEditDialog = async (rate: ExtendedExchangeRate) => {
    setEditingRate(rate)
    setFromCurrency(rate.from_currency)
    setToCurrency(rate.to_currency)
    setBuyRate(rate.buy_rate.toString())
    setSellRate(rate.sell_rate.toString())
    setMarketRate(rate.market_rate?.toString() || '')
    setIsPopular(rate.is_popular)
    setIsActive(rate.is_active)
    setProfitMethod(rate.profit_calculation_method || 'auto')
    setFixedBaseSource(rate.fixed_base_source || 'api')
    setMarginPercent(rate.margin_percent?.toString() || '2.0')
    setApiRate(rate.api_rate || null)
    
    // Подгружаем актуальный курс API
    const currentApiRate = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
    if (currentApiRate) {
      setApiRate(currentApiRate)
    }
    
    setIsDialogOpen(true)
  }
  
  const handleSave = async () => {
    if (!fromCurrency || !toCurrency) {
      toast.error('Заполните валютную пару')
      return
    }
    
    // Для ручного режима курсы обязательны
    if (profitMethod === 'manual' && (!buyRate || !sellRate)) {
      toast.error('Заполните курсы покупки и продажи')
      return
    }
    
    try {
      let finalBuyRate = parseFloat(buyRate) || 0
      let finalSellRate = parseFloat(sellRate) || 0
      let finalMarketRate = marketRate ? parseFloat(marketRate) : apiRate
      const margin = parseFloat(marginPercent) || 2.0
      
      // Расчет курсов в зависимости от метода
      if (profitMethod === 'auto') {
        // Авто: курс API = покупка у клиента, курс вручную = продажа клиенту
        // Разница = маржа
        if (apiRate && finalSellRate) {
          finalBuyRate = apiRate // Курс API для покупки
          finalMarketRate = apiRate
        }
      } else if (profitMethod === 'fixed_percent') {
        // Фикс процент: базовый курс + маржа%
        const baseRate = fixedBaseSource === 'api' && apiRate ? apiRate : parseFloat(buyRate) || 0
        finalBuyRate = baseRate
        finalSellRate = baseRate * (1 + margin / 100)
        finalMarketRate = baseRate
      }
      // manual: используем введенные вручную значения как есть
      
      const data = {
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        buy_rate: finalBuyRate,
        sell_rate: finalSellRate,
        market_rate: finalMarketRate,
        is_popular: isPopular,
        is_active: isActive,
        profit_calculation_method: profitMethod,
        fixed_base_source: fixedBaseSource,
        margin_percent: margin,
        api_rate: apiRate,
        api_rate_updated_at: apiRate ? new Date().toISOString() : null,
        last_updated: new Date().toISOString()
      }
      
      if (editingRate) {
        // Сохраняем в историю изменений (аудит)
        await supabase.from('exchange_rate_history').insert({
          rate_id: editingRate.id,
          from_currency: editingRate.from_currency,
          to_currency: editingRate.to_currency,
          old_buy_rate: editingRate.buy_rate,
          old_sell_rate: editingRate.sell_rate,
          old_market_rate: editingRate.market_rate,
          new_buy_rate: finalBuyRate,
          new_sell_rate: finalSellRate,
          new_market_rate: finalMarketRate
        })
        
        const { error } = await supabase
          .from('exchange_rates')
          .update(data)
          .eq('id', editingRate.id)
        
        if (error) throw error
        toast.success('Курс обновлен')
      } else {
        const { error } = await supabase
          .from('exchange_rates')
          .insert(data)
        
        if (error) throw error
        toast.success('Курс добавлен')
      }
      
      setIsDialogOpen(false)
      resetForm()
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка сохранения')
    }
  }
  
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот курс?')) return
    
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      toast.success('Курс удален')
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка удаления')
    }
  }
  
  const togglePopular = async (rate: ExtendedExchangeRate) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_popular: !rate.is_popular })
        .eq('id', rate.id)
      
      if (error) throw error
      loadRates()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  const toggleActive = async (rate: ExtendedExchangeRate) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_active: !rate.is_active })
        .eq('id', rate.id)
      
      if (error) throw error
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка обновления')
    }
  }

  const refreshApiRateForPair = async (rate: ExtendedExchangeRate) => {
    try {
      const currentApiRate = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
      if (!currentApiRate) {
        toast.error('Не удалось получить курс из API')
        return
      }
      
      const margin = rate.margin_percent || exchangeSettings?.default_margin_percent || 2
      let newBuyRate = currentApiRate
      let newSellRate = currentApiRate
      
      if (rate.profit_calculation_method === 'fixed_percent') {
        newSellRate = currentApiRate * (1 + margin / 100)
      }
      
      const { error } = await supabase
        .from('exchange_rates')
        .update({
          api_rate: currentApiRate,
          api_rate_updated_at: new Date().toISOString(),
          buy_rate: newBuyRate,
          sell_rate: newSellRate,
          market_rate: currentApiRate,
          last_updated: new Date().toISOString()
        })
        .eq('id', rate.id)
      
      if (error) throw error
      toast.success('Курс обновлен из API')
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  const toggleAutoRate = async (rate: ExtendedExchangeRate) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_auto_rate: !rate.is_auto_rate })
        .eq('id', rate.id)
      
      if (error) throw error
      loadRates()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  // Расчет маржи
  const calculateMargin = (buy: number, sell: number, market: number | null) => {
    if (!market) return null
    const avgRate = (buy + sell) / 2
    return ((avgRate - market) / market * 100).toFixed(2)
  }
  
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
              Управление курсами
            </CardTitle>
            <CardDescription>
              Настройка курсов покупки и продажи валют
              {exchangeSettings && (
                <span className="ml-2 text-xs text-cyan-400">
                  (автообновление каждые {exchangeSettings.rate_update_interval_minutes} мин)
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadRates} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open)
              if (!open) resetForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить курс
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingRate ? 'Редактировать курс' : 'Новый курс'}
                  </DialogTitle>
                  <DialogDescription>
                    Настройте валютную пару и режим обновления курсов
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Из валюты</Label>
                      <Input
                        placeholder="USD"
                        value={fromCurrency}
                        onChange={(e) => setFromCurrency(e.target.value.toUpperCase())}
                        maxLength={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>В валюту</Label>
                      <Input
                        placeholder="RUB"
                        value={toCurrency}
                        onChange={(e) => setToCurrency(e.target.value.toUpperCase())}
                        maxLength={5}
                      />
                    </div>
                  </div>
                  
                  {/* Выбор метода расчета */}
                  <div className="space-y-2">
                    <Label>Метод расчета прибыли</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div 
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          profitMethod === 'auto' 
                            ? 'border-cyan-500 bg-cyan-500/10' 
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => setProfitMethod('auto')}
                      >
                        <Wifi className={`h-5 w-5 mx-auto mb-1 ${profitMethod === 'auto' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium text-foreground">Авто</span>
                        <p className="text-xs text-muted-foreground mt-1">API vs Ручной</p>
                      </div>
                      <div 
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          profitMethod === 'manual' 
                            ? 'border-cyan-500 bg-cyan-500/10' 
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => setProfitMethod('manual')}
                      >
                        <WifiOff className={`h-5 w-5 mx-auto mb-1 ${profitMethod === 'manual' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium text-foreground">Ручной</span>
                        <p className="text-xs text-muted-foreground mt-1">Покупка vs Продажа</p>
                      </div>
                      <div 
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          profitMethod === 'fixed_percent' 
                            ? 'border-cyan-500 bg-cyan-500/10' 
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => setProfitMethod('fixed_percent')}
                      >
                        <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${profitMethod === 'fixed_percent' ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium text-foreground">Фикс %</span>
                        <p className="text-xs text-muted-foreground mt-1">Базовый + %</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Показ курса API */}
                  {apiRate && (
                    <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Текущий курс API:</span>
                        <span className="font-mono font-bold text-cyan-400">{apiRate.toFixed(4)}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Настройки для fixed_percent */}
                  {profitMethod === 'fixed_percent' && (
                    <div className="space-y-3 p-3 rounded-lg bg-secondary/30">
                      <div className="space-y-2">
                        <Label>Источник базового курса</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div 
                            className={`p-2 rounded border cursor-pointer text-center ${
                              fixedBaseSource === 'api' 
                                ? 'border-cyan-500 bg-cyan-500/10' 
                                : 'border-border'
                            }`}
                            onClick={() => setFixedBaseSource('api')}
                          >
                            <span className="text-sm">Из API</span>
                          </div>
                          <div 
                            className={`p-2 rounded border cursor-pointer text-center ${
                              fixedBaseSource === 'manual' 
                                ? 'border-cyan-500 bg-cyan-500/10' 
                                : 'border-border'
                            }`}
                            onClick={() => setFixedBaseSource('manual')}
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
                          value={marginPercent}
                          onChange={(e) => setMarginPercent(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Поля курсов */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={profitMethod === 'auto' && fixedBaseSource === 'api' ? '' : ''}>
                        {profitMethod === 'auto' ? 'Курс продажи (вручную)' : 
                         profitMethod === 'fixed_percent' && fixedBaseSource === 'api' ? 'Курс покупки (из API)' :
                         'Курс покупки'}
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="89.50"
                        value={buyRate}
                        onChange={(e) => setBuyRate(e.target.value)}
                        disabled={profitMethod === 'fixed_percent' && fixedBaseSource === 'api'}
                        className={profitMethod === 'fixed_percent' && fixedBaseSource === 'api' ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {profitMethod === 'auto' ? 'Вы задаете курс по которому продаете клиенту' :
                         profitMethod === 'manual' ? 'Мы покупаем у клиента по этому курсу' :
                         fixedBaseSource === 'api' ? 'Берется из API автоматически' : 'Базовый курс вручную'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {profitMethod === 'auto' ? 'Курс покупки (из API)' : 
                         profitMethod === 'fixed_percent' ? 'Курс продажи (авто)' :
                         'Курс продажи'}
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="91.50"
                        value={sellRate}
                        onChange={(e) => setSellRate(e.target.value)}
                        disabled={profitMethod === 'auto' || profitMethod === 'fixed_percent'}
                        className={profitMethod === 'auto' || profitMethod === 'fixed_percent' ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {profitMethod === 'auto' ? 'Берется из настроенных API источников' :
                         profitMethod === 'manual' ? 'Мы продаем клиенту по этому курсу' :
                         `Базовый + ${marginPercent}% = курс продажи`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Расчет маржи */}
                  {(buyRate || apiRate) && sellRate && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Расчетная маржа:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {(() => {
                            const buy = profitMethod === 'auto' ? (apiRate || 0) : parseFloat(buyRate) || 0
                            const sell = parseFloat(sellRate) || 0
                            if (buy && sell) {
                              const margin = ((sell - buy) / buy * 100).toFixed(2)
                              return `${margin}%`
                            }
                            return '—'
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is-popular"
                        checked={isPopular}
                        onCheckedChange={setIsPopular}
                      />
                      <Label htmlFor="is-popular" className="cursor-pointer">
                        Популярная пара
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is-active"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                      <Label htmlFor="is-active" className="cursor-pointer">
                        Активен
                      </Label>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="bg-transparent">
                      Отмена
                    </Button>
                    <Button onClick={handleSave}>
                      {editingRate ? 'Сохранить' : 'Добавить'}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пара</TableHead>
              <TableHead className="text-center">Метод</TableHead>
              <TableHead className="text-right">Покупка</TableHead>
              <TableHead className="text-right">Продажа</TableHead>
              <TableHead className="text-right">API курс</TableHead>
              <TableHead className="text-right">Маржа %</TableHead>
              <TableHead className="text-center">
                <Star className="h-4 w-4 mx-auto text-muted-foreground" />
              </TableHead>
              <TableHead className="text-center">Активен</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map(rate => (
              <TableRow 
                key={rate.id} 
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${!rate.is_active ? 'opacity-50' : ''}`}
                onClick={() => openEditDialog(rate)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{CURRENCY_FLAGS[rate.from_currency] || ''}</span>
                    <span className="font-medium text-foreground">{rate.from_currency}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span>{CURRENCY_FLAGS[rate.to_currency] || ''}</span>
                    <span className="font-medium text-foreground">{rate.to_currency}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mx-auto px-2 py-1 rounded">
                    {rate.profit_calculation_method === 'auto' ? (
                      <>
                        <Wifi className="h-4 w-4 text-cyan-400" />
                        <span className="text-xs text-cyan-400">Авто</span>
                      </>
                    ) : rate.profit_calculation_method === 'fixed_percent' ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-amber-400" />
                        <span className="text-xs text-amber-400">{rate.margin_percent || 2}%</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Ручн.</span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-green-400">{rate.buy_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-red-400">{rate.sell_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {rate.api_rate?.toFixed(4) || rate.market_rate?.toFixed(4) || '-'}
                </TableCell>
                <TableCell className="text-right">
                  {(() => {
                    const buy = rate.buy_rate
                    const sell = rate.sell_rate
                    if (buy && sell && buy > 0) {
                      const margin = ((sell - buy) / buy * 100).toFixed(2)
                      return (
                        <span className={`font-mono ${parseFloat(margin) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {margin}%
                        </span>
                      )
                    }
                    return '-'
                  })()}
                </TableCell>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePopular(rate)
                    }}
                    className={rate.is_popular ? 'text-amber-400' : 'text-muted-foreground'}
                  >
                    <Star className="h-4 w-4" fill={rate.is_popular ? 'currentColor' : 'none'} />
                  </Button>
                </TableCell>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={rate.is_active}
                    onCheckedChange={() => toggleActive(rate)}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditDialog(rate)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(rate.id)
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rates.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Нет курсов. Добавьте первый курс.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
