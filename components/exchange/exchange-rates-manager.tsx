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
  
  // Форма
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [marketRate, setMarketRate] = useState('')
  const [isPopular, setIsPopular] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isAutoRate, setIsAutoRate] = useState(true)

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

  // Автоматическое обновление курсов из API
  const updateAutoRates = useCallback(async () => {
    const autoRates = rates.filter(r => r.is_auto_rate)
    if (autoRates.length === 0) return
    
    let updated = false
    for (const rate of autoRates) {
      const apiRate = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
      if (apiRate) {
        // Применяем маржу
        const margin = exchangeSettings?.default_margin_percent || rate.buy_margin_percent || 2
        const newBuyRate = apiRate * (1 - margin / 100)
        const newSellRate = apiRate * (1 + margin / 100)
        
        await supabase
          .from('exchange_rates')
          .update({
            buy_rate: newBuyRate,
            sell_rate: newSellRate,
            market_rate: apiRate,
            last_updated: new Date().toISOString()
          })
          .eq('id', rate.id)
        
        updated = true
      }
    }
    
    if (updated) {
      loadRates()
    }
  }, [rates, fetchRateFromAPI, supabase, loadRates, exchangeSettings])

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
    setIsAutoRate(true)
    setEditingRate(null)
  }
  
  const openEditDialog = (rate: ExtendedExchangeRate) => {
    setEditingRate(rate)
    setFromCurrency(rate.from_currency)
    setToCurrency(rate.to_currency)
    setBuyRate(rate.buy_rate.toString())
    setSellRate(rate.sell_rate.toString())
    setMarketRate(rate.market_rate?.toString() || '')
    setIsPopular(rate.is_popular)
    setIsActive(rate.is_active)
    setIsAutoRate(rate.is_auto_rate ?? true)
    setIsDialogOpen(true)
  }
  
  const handleSave = async () => {
    if (!fromCurrency || !toCurrency) {
      toast.error('Заполните валютную пару')
      return
    }
    
    // Для авто-режима курсы необязательны, они загрузятся из API
    if (!isAutoRate && (!buyRate || !sellRate)) {
      toast.error('Заполните курсы покупки и продажи')
      return
    }
    
    try {
      const newBuyRate = parseFloat(buyRate) || 0
      const newSellRate = parseFloat(sellRate) || 0
      const newMarketRate = marketRate ? parseFloat(marketRate) : null
      
      const data = {
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        buy_rate: newBuyRate,
        sell_rate: newSellRate,
        market_rate: newMarketRate,
        is_popular: isPopular,
        is_active: isActive,
        is_auto_rate: isAutoRate,
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
          new_buy_rate: newBuyRate,
          new_sell_rate: newSellRate,
          new_market_rate: newMarketRate
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
        
        // Если авто-режим - сразу обновляем курс из API
        if (isAutoRate) {
          setTimeout(() => updateAutoRates(), 500)
        }
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

  const toggleAutoRate = async (rate: ExtendedExchangeRate) => {
    try {
      const newIsAuto = !rate.is_auto_rate
      
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_auto_rate: newIsAuto })
        .eq('id', rate.id)
      
      if (error) throw error
      
      // Если включили авто - сразу обновляем курс из API
      if (newIsAuto) {
        const apiRate = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
        if (apiRate) {
          const margin = exchangeSettings?.default_margin_percent || rate.buy_margin_percent || 2
          await supabase
            .from('exchange_rates')
            .update({
              buy_rate: apiRate * (1 - margin / 100),
              sell_rate: apiRate * (1 + margin / 100),
              market_rate: apiRate,
              last_updated: new Date().toISOString()
            })
            .eq('id', rate.id)
        }
        toast.success('Курс из API включен')
      } else {
        toast.success('Ручной режим включен')
      }
      
      loadRates()
      onUpdate?.()
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
                  
                  {/* Выбор режима: вручную / из API */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex items-center gap-3">
                      {isAutoRate ? (
                        <Wifi className="h-5 w-5 text-green-400" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium text-foreground">
                          {isAutoRate ? 'Курс из API' : 'Ручной курс'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isAutoRate 
                            ? 'Автоматически обновляется из настроенных источников' 
                            : 'Курс задается вручную'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isAutoRate}
                      onCheckedChange={setIsAutoRate}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className={isAutoRate ? 'text-muted-foreground' : ''}>Курс покупки</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder={isAutoRate ? 'Авто' : '89.50'}
                        value={buyRate}
                        onChange={(e) => setBuyRate(e.target.value)}
                        disabled={isAutoRate}
                        className={isAutoRate ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {isAutoRate ? 'Устанавливается автоматически' : 'Мы покупаем у клиента'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className={isAutoRate ? 'text-muted-foreground' : ''}>Курс продажи</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder={isAutoRate ? 'Авто' : '91.50'}
                        value={sellRate}
                        onChange={(e) => setSellRate(e.target.value)}
                        disabled={isAutoRate}
                        className={isAutoRate ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {isAutoRate ? 'Устанавливается автоматически' : 'Мы продаем клиенту'}
                      </p>
                    </div>
                  </div>
                  
                  {!isAutoRate && (
                    <div className="space-y-2">
                      <Label>Рыночный курс (опционально)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="90.50"
                        value={marketRate}
                        onChange={(e) => setMarketRate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Для расчета маржи</p>
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
              <TableHead className="text-center">Режим</TableHead>
              <TableHead className="text-right">Покупка</TableHead>
              <TableHead className="text-right">Продажа</TableHead>
              <TableHead className="text-right">Рыночный</TableHead>
              <TableHead className="text-right">Маржа</TableHead>
              <TableHead className="text-center">
                <Star className="h-4 w-4 mx-auto text-muted-foreground" />
              </TableHead>
              <TableHead className="text-center">Активен</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map(rate => (
              <TableRow key={rate.id} className={!rate.is_active ? 'opacity-50' : ''}>
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
                  <button
                    onClick={() => toggleAutoRate(rate)}
                    className="flex items-center justify-center gap-1.5 mx-auto px-2 py-1 rounded hover:bg-secondary/50 transition-colors"
                    title={rate.is_auto_rate ? 'Переключить на ручной режим' : 'Переключить на API'}
                  >
                    {rate.is_auto_rate ? (
                      <>
                        <Wifi className="h-4 w-4 text-green-400" />
                        <span className="text-xs text-green-400">API</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Ручной</span>
                      </>
                    )}
                  </button>
                </TableCell>
                <TableCell className="text-right font-mono text-green-400">{rate.buy_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-red-400">{rate.sell_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {rate.market_rate?.toFixed(4) || '-'}
                </TableCell>
                <TableCell className="text-right">
                  {rate.market_rate ? (
                    <span className={`font-mono ${
                      parseFloat(calculateMargin(rate.buy_rate, rate.sell_rate, rate.market_rate) || '0') > 0 
                        ? 'text-emerald-400' 
                        : 'text-red-400'
                    }`}>
                      {calculateMargin(rate.buy_rate, rate.sell_rate, rate.market_rate)}%
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePopular(rate)}
                    className={rate.is_popular ? 'text-amber-400' : 'text-muted-foreground'}
                  >
                    <Star className="h-4 w-4" fill={rate.is_popular ? 'currentColor' : 'none'} />
                  </Button>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={rate.is_active}
                    onCheckedChange={() => toggleActive(rate)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(rate)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rate.id)}
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
