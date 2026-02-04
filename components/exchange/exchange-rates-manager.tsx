'use client'

import { Badge } from "@/components/ui/badge"

import { SelectItem } from "@/components/ui/select"

import { SelectContent } from "@/components/ui/select"

import { SelectValue } from "@/components/ui/select"

import { SelectTrigger } from "@/components/ui/select"

import { Select } from "@/components/ui/select"

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
import { Plus, Pencil, Trash2, RefreshCw, Star, TrendingUp, ArrowRight, Wifi, WifiOff, Check, X } from 'lucide-react'
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
  const [isLoadingApiRate, setIsLoadingApiRate] = useState(false)
  const [apiRateError, setApiRateError] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [allSources, setAllSources] = useState<CurrencyRateSource[]>([])
  const [availableSourcesForPair, setAvailableSourcesForPair] = useState<{from: CurrencyRateSource[], to: CurrencyRateSource[]}>({from: [], to: []})

  // Получить курс из конкретного источника
  const fetchRateFromSource = useCallback(async (source: CurrencyRateSource, targetCurrency?: string): Promise<number | null> => {
    try {
      // Для криптовалют используем Binance
      if (source.source_type === 'crypto') {
        const symbol = `${source.currency_code}USDT`
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
        if (res.ok) {
          const data = await res.json()
          const priceInUSDT = parseFloat(data.price)
          // Если целевая валюта USDT или USD - возвращаем как есть
          if (targetCurrency === 'USDT' || targetCurrency === 'USD') {
            return priceInUSDT
          }
          return priceInUSDT
        }
      }
      
      // Для фиатных валют используем Exchange Rate API
      if (source.source_type === 'api') {
        // Используем api_url если указан, иначе дефолтный
        const apiUrl = source.api_url || `https://open.er-api.com/v6/latest/${source.currency_code}`
        const res = await fetch(apiUrl)
        if (res.ok) {
          const data = await res.json()
          if (targetCurrency && data.rates?.[targetCurrency]) {
            return data.rates[targetCurrency]
          }
          // Возвращаем последний известный курс если есть
          return source.last_rate
        }
      }
      
      // Для ручных источников возвращаем сохраненный курс
      if (source.source_type === 'manual') {
        return source.last_rate
      }
      
      return null
    } catch {
      return null
    }
  }, [])
  
  // Получить курс из API для валютной пары используя настроенные источники
  const fetchRateFromAPI = useCallback(async (fromCurr: string, toCurr: string, specificSourceId?: string): Promise<{ rate: number | null, sourceUsed: CurrencyRateSource | null }> => {
    // Если указан конкретный источник - используем его
    if (specificSourceId) {
      const source = allSources.find(s => s.id === specificSourceId)
      if (source) {
        const rate = await fetchRateFromSource(source, toCurr)
        return { rate, sourceUsed: source }
      }
    }
    
    // Ищем источники для валют
    const fromSources = allSources.filter(s => s.currency_code === fromCurr && s.is_active)
    const toSources = allSources.filter(s => s.currency_code === toCurr && s.is_active)
    
    // Пробуем получить курс через источник "от" валюты
    for (const source of fromSources.sort((a, b) => a.priority - b.priority)) {
      if (source.source_type === 'api') {
        try {
          const apiUrl = source.api_url || `https://open.er-api.com/v6/latest/${fromCurr}`
          const res = await fetch(apiUrl)
          if (res.ok) {
            const data = await res.json()
            if (data.rates?.[toCurr]) {
              return { rate: data.rates[toCurr], sourceUsed: source }
            }
          }
        } catch {}
      }
      if (source.source_type === 'crypto') {
        // Криптовалюта -> USDT
        if (toCurr === 'USDT' || toCurr === 'USD') {
          try {
            const symbol = `${fromCurr}USDT`
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
            if (res.ok) {
              const data = await res.json()
              return { rate: parseFloat(data.price), sourceUsed: source }
            }
          } catch {}
        }
      }
    }
    
    // Пробуем через источник "в" валюту (обратный курс)
    for (const source of toSources.sort((a, b) => a.priority - b.priority)) {
      if (source.source_type === 'crypto') {
        // USDT -> Криптовалюта (обратный курс)
        if (fromCurr === 'USDT' || fromCurr === 'USD') {
          try {
            const symbol = `${toCurr}USDT`
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
            if (res.ok) {
              const data = await res.json()
              return { rate: 1 / parseFloat(data.price), sourceUsed: source }
            }
          } catch {}
        }
      }
    }
    
    // Fallback на стандартный API
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurr}`)
      if (res.ok) {
        const data = await res.json()
        if (data.rates?.[toCurr]) {
          return { rate: data.rates[toCurr], sourceUsed: null }
        }
      }
    } catch {}
    
    // Fallback для криптовалют через Binance
    const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'SOL', 'ADA']
    const isCryptoFrom = cryptoCurrencies.includes(fromCurr)
    const isCryptoTo = cryptoCurrencies.includes(toCurr)
    
    if (isCryptoFrom || isCryptoTo) {
      try {
        if (isCryptoFrom && (toCurr === 'USD' || toCurr === 'USDT')) {
          const symbol = `${fromCurr}USDT`
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
          if (res.ok) {
            const data = await res.json()
            return { rate: parseFloat(data.price), sourceUsed: null }
          }
        }
        if (isCryptoTo && (fromCurr === 'USD' || fromCurr === 'USDT')) {
          const symbol = `${toCurr}USDT`
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
          if (res.ok) {
            const data = await res.json()
            return { rate: 1 / parseFloat(data.price), sourceUsed: null }
          }
        }
        // Крипто к крипто через USDT
        if (isCryptoFrom && isCryptoTo) {
          const fromRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${fromCurr}USDT`)
          const toRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${toCurr}USDT`)
          if (fromRes.ok && toRes.ok) {
            const fromData = await fromRes.json()
            const toData = await toRes.json()
            const rate = parseFloat(fromData.price) / parseFloat(toData.price)
            return { rate, sourceUsed: null }
          }
        }
      } catch {}
    }
    
    return { rate: null, sourceUsed: null }
  }, [allSources, fetchRateFromSource])

  const loadRates = useCallback(async () => {
    setIsLoading(true)
    try {
      const [ratesResult, sourcesResult, allSourcesResult, settingsResult] = await Promise.all([
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
          .from('currency_rate_sources')
          .select('*')
          .eq('is_active', true)
          .order('priority'),
        supabase
          .from('exchange_settings')
          .select('rate_update_interval_minutes, default_margin_percent')
          .limit(1)
          .single()
      ])
      
      if (ratesResult.error) throw ratesResult.error
      setRates(ratesResult.data || [])
      setRateSources(sourcesResult.data || [])
      setAllSources(allSourcesResult.data || [])
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
      const { rate: currentApiRate } = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
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
    setApiRateError(null)
    setIsLoadingApiRate(false)
    setSelectedSourceId('')
    setAvailableSourcesForPair({from: [], to: []})
    setEditingRate(null)
  }
  
  // Обновить доступные источники для пары
  const updateAvailableSources = useCallback((from: string, to: string) => {
    const fromSources = allSources.filter(s => s.currency_code === from && s.is_active)
    const toSources = allSources.filter(s => s.currency_code === to && s.is_active)
    setAvailableSourcesForPair({ from: fromSources, to: toSources })
    
    // Авто-выбор источника по приоритету
    const defaultSource = fromSources.find(s => s.is_default) || fromSources[0] || toSources.find(s => s.is_default) || toSources[0]
    if (defaultSource) {
      setSelectedSourceId(defaultSource.id)
    } else {
      setSelectedSourceId('')
    }
  }, [allSources])
  
  // Загрузить курс из API с обратной связью
  const loadApiRateForPair = async (from: string, to: string, sourceId?: string) => {
    if (!from || !to || from === to) {
      setApiRate(null)
      setApiRateError(null)
      return
    }
    
    setIsLoadingApiRate(true)
    setApiRateError(null)
    
    // Обновим доступные источники
    updateAvailableSources(from, to)
    
    try {
      const { rate, sourceUsed } = await fetchRateFromAPI(from, to, sourceId || selectedSourceId)
      if (rate) {
        setApiRate(rate)
        setApiRateError(null)
        // Автозаполнение курсов в зависимости от метода
        if (profitMethod === 'auto' || profitMethod === 'fixed_percent') {
          setBuyRate(rate.toFixed(4))
          if (profitMethod === 'fixed_percent') {
            const margin = parseFloat(marginPercent) || 2.0
            setSellRate((rate * (1 + margin / 100)).toFixed(4))
          }
        }
        const sourceInfo = sourceUsed ? ` (${sourceUsed.source_name})` : ''
        toast.success(`Курс найден: 1 ${from} = ${rate.toFixed(4)} ${to}${sourceInfo}`)
      } else {
        setApiRate(null)
        setApiRateError(`Курс ${from}/${to} не найден. Проверьте источники в настройках.`)
        toast.error(`Курс ${from}/${to} не найден. Добавьте источники в настройках.`)
      }
    } catch (err) {
      setApiRate(null)
      setApiRateError('Ошибка загрузки курса из API')
      toast.error('Ошибка загрузки курса из API')
    } finally {
      setIsLoadingApiRate(false)
    }
  }
  
const openEditDialog = async (rate: ExtendedExchangeRate) => {
    setEditingRate(rate)
    setFromCurrency(rate.from_currency)
    setToCurrency(rate.to_currency)
    setMarketRate(rate.market_rate?.toString() || '')
    setIsPopular(rate.is_popular)
    setIsActive(rate.is_active)
    setProfitMethod(rate.profit_calculation_method || 'auto')
    setFixedBaseSource(rate.fixed_base_source || 'api')
    setMarginPercent(rate.margin_percent?.toString() || '2.0')
    setApiRate(rate.api_rate || null)
    
    // Для режима AUTO: в БД buy_rate=API, sell_rate=ручной
    // В UI: buyRate="Курс продажи (вручную)", sellRate="Курс покупки (из API)"
    if (rate.profit_calculation_method === 'auto') {
      // buyRate = ручной курс продажи клиенту (из sell_rate в БД)
      setBuyRate(rate.sell_rate.toString())
      // sellRate = API курс покупки у клиента (из buy_rate в БД)
      setSellRate(rate.buy_rate.toString())
    } else {
      setBuyRate(rate.buy_rate.toString())
      setSellRate(rate.sell_rate.toString())
    }
    
    // Подгружаем актуальный курс API
    const { rate: currentApiRate } = await fetchRateFromAPI(rate.from_currency, rate.to_currency)
    if (currentApiRate) {
      setApiRate(currentApiRate)
      // Для режима auto: обновляем только отображение API курса, не трогаем ручной
      if (rate.profit_calculation_method === 'auto') {
        setSellRate(currentApiRate.toFixed(4))
      }
      // Для режима fixed_percent: buyRate = базовый курс из API
      if (rate.profit_calculation_method === 'fixed_percent') {
        setBuyRate(currentApiRate.toFixed(4))
        // sellRate рассчитывается автоматически с маржой
        const margin = rate.margin_percent || 2.0
        setSellRate((currentApiRate * (1 + margin / 100)).toFixed(4))
      }
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
        // Авто: buyRate в UI = ручной курс продажи клиенту, apiRate = курс покупки у клиента
        // В БД сохраняем: buy_rate = API, sell_rate = ручной
        const manualSellRate = parseFloat(buyRate) || 0 // Из поля "Курс продажи (вручную)"
        finalBuyRate = apiRate || finalBuyRate // API курс покупки
        finalSellRate = manualSellRate // Ручной курс продажи
        finalMarketRate = apiRate || finalMarketRate
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
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase()
                          setFromCurrency(val)
                          // Обновляем доступные источники
                          if (val.length >= 3 && toCurrency.length >= 3) {
                            updateAvailableSources(val, toCurrency)
                          }
                          // Автозагрузка курса при заполнении обеих валют
                          if (val.length >= 3 && toCurrency.length >= 3 && profitMethod !== 'manual') {
                            loadApiRateForPair(val, toCurrency)
                          }
                        }}
                        maxLength={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>В валюту</Label>
                      <Input
                        placeholder="RUB"
                        value={toCurrency}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase()
                          setToCurrency(val)
                          // Обновляем доступные источники
                          if (fromCurrency.length >= 3 && val.length >= 3) {
                            updateAvailableSources(fromCurrency, val)
                          }
                          // Автозагрузка курса при заполнении обеих валют
                          if (fromCurrency.length >= 3 && val.length >= 3 && profitMethod !== 'manual') {
                            loadApiRateForPair(fromCurrency, val)
                          }
                        }}
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
                        onClick={() => {
                          setProfitMethod('auto')
                          // Загружаем курс при переключении на авто режим
                          if (fromCurrency.length >= 3 && toCurrency.length >= 3) {
                            loadApiRateForPair(fromCurrency, toCurrency)
                          }
                        }}
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
                        <p className="text-xs text-muted-foreground mt-1">Рынок vs Клиенту</p>
                      </div>
                      <div 
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          profitMethod === 'fixed_percent' 
                            ? 'border-cyan-500 bg-cyan-500/10' 
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => {
                          setProfitMethod('fixed_percent')
                          // Загружаем курс при переключении на фикс режим
                          if (fromCurrency.length >= 3 && toCurrency.length >= 3) {
                            loadApiRateForPair(fromCurrency, toCurrency)
                          }
                        }}
                      >
                        <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${profitMethod === 'fixed_percent' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium text-foreground">Фикс %</span>
                        <p className="text-xs text-muted-foreground mt-1">Базовый + %</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Блок выбора источника и загрузки курса */}
                  {(profitMethod === 'auto' || profitMethod === 'fixed_percent') && fromCurrency && toCurrency && (
                    <div className="space-y-3">
                      {/* Доступные источники */}
                      {(availableSourcesForPair.from.length > 0 || availableSourcesForPair.to.length > 0) && (
                        <div className="space-y-2">
                          <Label className="text-sm">Источник курса</Label>
                          <Select 
                            value={selectedSourceId} 
                            onValueChange={(v) => {
                              setSelectedSourceId(v)
                              loadApiRateForPair(fromCurrency, toCurrency, v)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите источник" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableSourcesForPair.from.map(source => (
                                <SelectItem key={source.id} value={source.id}>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${
                                      source.source_type === 'crypto' ? 'bg-orange-400' : 
                                      source.source_type === 'api' ? 'bg-blue-400' : 'bg-gray-400'
                                    }`} />
                                    <span>{source.source_name}</span>
                                    <span className="text-xs text-muted-foreground">({source.currency_code})</span>
                                    {source.is_default && <Badge variant="outline" className="text-xs">По умолч.</Badge>}
                                  </div>
                                </SelectItem>
                              ))}
                              {availableSourcesForPair.to.map(source => (
                                <SelectItem key={source.id} value={source.id}>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${
                                      source.source_type === 'crypto' ? 'bg-orange-400' : 
                                      source.source_type === 'api' ? 'bg-blue-400' : 'bg-gray-400'
                                    }`} />
                                    <span>{source.source_name}</span>
                                    <span className="text-xs text-muted-foreground">({source.currency_code})</span>
                                    {source.is_default && <Badge variant="outline" className="text-xs">По умолч.</Badge>}
                                  </div>
                                </SelectItem>
                              ))}
                              <SelectItem value="auto">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                  <span>Автоматический поиск</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {/* Статус курса */}
                      <div className={`p-3 rounded-lg border ${
                        apiRate 
                          ? 'bg-cyan-500/10 border-cyan-500/20' 
                          : apiRateError 
                          ? 'bg-red-500/10 border-red-500/20'
                          : 'bg-secondary/30 border-border'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {isLoadingApiRate ? (
                              <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Поиск курса в источниках...</span>
                              </div>
                            ) : apiRate ? (
                              <div>
                                <div className="flex items-center gap-2">
                                  <Check className="h-4 w-4 text-green-400" />
                                  <span className="text-sm text-muted-foreground">Курс найден:</span>
                                </div>
<p className="font-mono font-bold text-cyan-400 mt-1">
                                1 {fromCurrency} = {Number(apiRate).toFixed(4)} {toCurrency}
                              </p>
                              </div>
                            ) : apiRateError ? (
                              <div>
                                <div className="flex items-center gap-2">
                                  <X className="h-4 w-4 text-red-400" />
                                  <span className="text-sm text-red-400">{apiRateError}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Добавьте источник для {fromCurrency} или {toCurrency} в <a href="/settings?tab=exchange" className="text-cyan-400 hover:underline">настройках</a>
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Нажмите "Обновить" для загрузки курса
                              </span>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadApiRateForPair(fromCurrency, toCurrency, selectedSourceId || undefined)}
                            disabled={isLoadingApiRate || !fromCurrency || !toCurrency}
                            className="ml-2 bg-transparent"
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingApiRate ? 'animate-spin' : ''}`} />
                            Обновить
                          </Button>
                        </div>
                      </div>
                      
                      {/* Подсказка если нет источников */}
                      {availableSourcesForPair.from.length === 0 && availableSourcesForPair.to.length === 0 && (
                        <p className="text-xs text-amber-400">
                          Источники для {fromCurrency} и {toCurrency} не настроены. Будет использован стандартный API.
                        </p>
                      )}
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
                      <Label>
                        {profitMethod === 'auto' ? 'Рынок (из API)' : 
                         profitMethod === 'fixed_percent' && fixedBaseSource === 'api' ? 'Рынок (из API)' :
                         'Рынок'}
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="89.50"
                        value={profitMethod === 'auto' ? (apiRate?.toString() || sellRate) : buyRate}
                        onChange={(e) => profitMethod === 'auto' ? setSellRate(e.target.value) : setBuyRate(e.target.value)}
                        disabled={profitMethod === 'auto' || (profitMethod === 'fixed_percent' && fixedBaseSource === 'api')}
                        className={profitMethod === 'auto' || (profitMethod === 'fixed_percent' && fixedBaseSource === 'api') ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {profitMethod === 'auto' ? 'Рыночный курс из API' :
                         profitMethod === 'manual' ? 'Рыночный/API курс валюты' :
                         fixedBaseSource === 'api' ? 'Берется из API автоматически' : 'Базовый курс вручную'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {profitMethod === 'auto' ? 'Клиенту (вручную)' : 
                         profitMethod === 'fixed_percent' ? 'Клиенту (авто)' :
                         'Клиенту'}
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="91.50"
                        value={profitMethod === 'auto' ? buyRate : sellRate}
                        onChange={(e) => profitMethod === 'auto' ? setBuyRate(e.target.value) : setSellRate(e.target.value)}
                        disabled={profitMethod === 'fixed_percent'}
                        className={profitMethod === 'fixed_percent' ? 'opacity-50' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {profitMethod === 'auto' ? 'Курс который вы даете клиенту' :
                         profitMethod === 'manual' ? 'Курс который вы даете клиенту' :
                         `Базовый + ${marginPercent}% = курс клиенту`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Расчет маржи */}
                  {(buyRate || apiRate) && sellRate && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Расчетная маржа:</span>
                        {(() => {
                  // Для AUTO: buyRate = ручной курс клиенту, sellRate/apiRate = рыночный API курс
                  // Маржа = (Рынок - Клиенту) / Рынок * 100
                  // Если даем клиенту меньше чем рынок - мы в плюсе
                  let marginVal = 0
                  if (profitMethod === 'auto') {
                    const clientRate = parseFloat(buyRate) || 0 // Курс клиенту (ручной)
                    const marketRate = apiRate || parseFloat(sellRate) || 0 // Рыночный API курс
                    if (clientRate && marketRate) {
                      marginVal = (marketRate - clientRate) / marketRate * 100
                    }
                  } else {
                    // Для manual/fixed: Рынок = buyRate, Клиенту = sellRate
                    // Маржа = (Рынок - Клиенту) / Рынок * 100
                    const marketRate = parseFloat(buyRate) || 0
                    const clientRate = parseFloat(sellRate) || 0
                    if (marketRate && clientRate) {
                      marginVal = (marketRate - clientRate) / marketRate * 100
                    }
                  }
                  const marginStr = Math.abs(marginVal).toFixed(2)
                  const marginSign = marginVal >= 0 ? '+' : '-'
                  const marginColor = marginVal >= 0 ? 'text-emerald-400' : 'text-red-400'
                  return <span className={`font-mono font-bold ${marginColor}`}>{marginSign}{marginStr}%</span>
                  })()}
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
<TableHead className="text-right">Рынок</TableHead>
                    <TableHead className="text-right">Клиенту</TableHead>
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
                    // Маржа = (buy - sell) / buy * 100
                    const margin = ((buy - sell) / buy * 100).toFixed(2)
                    return (
                      <span className={`font-mono ${parseFloat(margin) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(margin) >= 0 ? '+' : ''}{margin}%
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
