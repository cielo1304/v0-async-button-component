'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RefreshCw, TrendingUp, Wifi, WifiOff, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate, CurrencyRateSource } from '@/lib/types/database'
import { fetchExternalRate } from '@/app/actions/exchange'

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

interface EditRateDialogProps {
  rate: ExchangeRate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

export function EditRateDialog({ rate, open, onOpenChange, onSave }: EditRateDialogProps) {
  const supabase = useMemo(() => createClient(), [])
  
  // Form state
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
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
  const [isSaving, setIsSaving] = useState(false)

  // Load sources
  useEffect(() => {
    const loadSources = async () => {
      const { data } = await supabase
        .from('currency_rate_sources')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
      if (data) setAllSources(data)
    }
    loadSources()
  }, [supabase])

  // Update available sources for pair
  const updateAvailableSources = useCallback((from: string, to: string) => {
    const fromSources = allSources.filter(s => s.currency_code === from)
    const toSources = allSources.filter(s => s.currency_code === to)
    setAvailableSourcesForPair({ from: fromSources, to: toSources })
    
    // Auto-select default source
    const defaultSource = [...fromSources, ...toSources].find(s => s.is_default) || fromSources[0] || toSources[0]
    if (defaultSource && !selectedSourceId) {
      setSelectedSourceId(defaultSource.id)
    }
  }, [allSources, selectedSourceId])

  // Load API rate for pair via Server Action (обход CORS)
  const loadApiRateForPair = useCallback(async (from: string, to: string, sourceId?: string) => {
    setIsLoadingApiRate(true)
    setApiRateError(null)
    setApiRate(null)

    try {
      // Получаем источник если указан
      let sourceType: string | undefined
      let apiUrl: string | undefined
      let apiPath: string | undefined
      
      if (sourceId && sourceId !== 'auto') {
        const source = allSources.find(s => s.id === sourceId)
        if (source) {
          sourceType = source.source_type
          apiUrl = source.api_url || undefined
          apiPath = source.api_path || undefined
        }
      }

      // Вызываем Server Action для получения курса
      const result = await fetchExternalRate(from, to, sourceType, apiUrl, apiPath)
      
      if (result.rate) {
        setApiRate(result.rate)
      } else {
        setApiRateError(result.error || 'Курс не найден')
      }
    } catch (error) {
      console.error('Error loading rate:', error)
      setApiRateError('Ошибка загрузки курса')
    } finally {
      setIsLoadingApiRate(false)
    }
  }, [allSources])

  // Initialize form when rate changes
  useEffect(() => {
    if (rate && open) {
      setFromCurrency(rate.from_currency)
      setToCurrency(rate.to_currency)
      setProfitMethod(rate.profit_calculation_method || 'auto')
      setFixedBaseSource(rate.fixed_base_source || 'api')
      setMarginPercent(rate.margin_percent?.toString() || '2.0')
      setIsPopular(rate.is_popular)
      setIsActive(rate.is_active)
      
      // Load values based on method
      if (rate.profit_calculation_method === 'auto') {
        setBuyRate(rate.sell_rate.toString())
        setSellRate(rate.buy_rate.toString())
      } else {
        setBuyRate(rate.buy_rate.toString())
        setSellRate(rate.sell_rate.toString())
      }
      
      // Update sources and load API rate
      updateAvailableSources(rate.from_currency, rate.to_currency)
      if (rate.profit_calculation_method !== 'manual') {
        loadApiRateForPair(rate.from_currency, rate.to_currency)
      }
    }
  }, [rate, open, updateAvailableSources, loadApiRateForPair])

  // Handle save
  const handleSave = async () => {
    if (!rate) return
    
    setIsSaving(true)
    try {
      let finalBuyRate = parseFloat(buyRate) || 0
      let finalSellRate = parseFloat(sellRate) || 0
      let finalMarketRate = apiRate || finalBuyRate
      const margin = parseFloat(marginPercent) || 2.0

      if (profitMethod === 'auto') {
        const manualClientRate = parseFloat(buyRate) || 0
        finalBuyRate = apiRate || 0
        finalSellRate = manualClientRate
        finalMarketRate = apiRate || 0
      } else if (profitMethod === 'fixed_percent') {
        const baseRate = fixedBaseSource === 'api' && apiRate ? apiRate : parseFloat(buyRate) || 0
        finalBuyRate = baseRate
        finalSellRate = baseRate * (1 + margin / 100)
        finalMarketRate = baseRate
      }

      const { error } = await supabase
        .from('exchange_rates')
        .update({
          buy_rate: finalBuyRate,
          sell_rate: finalSellRate,
          profit_calculation_method: profitMethod,
          fixed_base_source: fixedBaseSource,
          margin_percent: margin,
          api_rate: apiRate,
          api_rate_updated_at: apiRate ? new Date().toISOString() : null,
          market_rate: finalMarketRate,
          is_popular: isPopular,
          is_active: isActive,
          last_updated: new Date().toISOString()
        })
        .eq('id', rate.id)

      if (error) throw error
      
      toast.success('Курс обновлен')
      onOpenChange(false)
      onSave()
    } catch (err) {
      toast.error('Ошибка сохранения курса')
    } finally {
      setIsSaving(false)
    }
  }

  if (!rate) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Редактировать курс</DialogTitle>
          <DialogDescription>
            Настройте валютную пару и режим обновления курсов
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {/* Currency fields (readonly for edit) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Из валюты</Label>
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-secondary/50 border">
                <span>{CURRENCY_FLAGS[fromCurrency] || ''}</span>
                <span className="font-mono">{fromCurrency}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>В валюту</Label>
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-secondary/50 border">
                <span>{CURRENCY_FLAGS[toCurrency] || ''}</span>
                <span className="font-mono">{toCurrency}</span>
              </div>
            </div>
          </div>

          {/* Method selection */}
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
                  const prevMethod = profitMethod
                  if (prevMethod !== 'auto') {
                    const tempBuy = buyRate
                    const tempSell = sellRate
                    setBuyRate(tempSell)
                    setSellRate(tempBuy)
                  }
                  setProfitMethod('auto')
                  if (fromCurrency && toCurrency) {
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
                onClick={() => {
                  const prevMethod = profitMethod
                  if (prevMethod === 'auto') {
                    const tempBuy = buyRate
                    const tempSell = sellRate
                    setBuyRate(tempSell)
                    setSellRate(tempBuy)
                  }
                  setProfitMethod('manual')
                }}
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
                  const prevMethod = profitMethod
                  if (prevMethod === 'auto') {
                    const tempBuy = buyRate
                    const tempSell = sellRate
                    setBuyRate(tempSell)
                    setSellRate(tempBuy)
                  }
                  setProfitMethod('fixed_percent')
                  if (fromCurrency && toCurrency) {
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

          {/* Source selection and rate status */}
          {(profitMethod === 'auto' || profitMethod === 'fixed_percent') && (
            <div className="space-y-3">
              {/* Source selector */}
              {(availableSourcesForPair.from.length > 0 || availableSourcesForPair.to.length > 0) ? (
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
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">Источник курса</Label>
                  <div className="p-3 rounded-lg border bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-sm">Exchange Rate API</span>
                      <span className="text-xs text-muted-foreground">({fromCurrency})</span>
                      <Badge variant="outline" className="text-xs">По умолч.</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Rate status */}
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
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Нажмите &quot;Обновить&quot; для загрузки курса
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadApiRateForPair(fromCurrency, toCurrency, selectedSourceId || undefined)}
                    disabled={isLoadingApiRate}
                    className="ml-2 bg-transparent"
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingApiRate ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Fixed percent settings */}
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

          {/* Rate fields */}
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

          {/* Margin calculation - only for manual and fixed_percent */}
          {profitMethod !== 'auto' && parseFloat(buyRate) > 0 && parseFloat(sellRate) > 0 && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Расчетная маржа:</span>
                {(() => {
                  const marketRate = parseFloat(buyRate) || 0
                  const clientRate = parseFloat(sellRate) || 0
                  let marginVal = 0
                  if (marketRate && clientRate) {
                    marginVal = (marketRate - clientRate) / marketRate * 100
                  }
                  const marginStr = Math.abs(marginVal).toFixed(2)
                  const marginSign = marginVal >= 0 ? '+' : '-'
                  const marginColor = marginVal >= 0 ? 'text-emerald-400' : 'text-red-400'
                  return <span className={`font-mono font-bold ${marginColor}`}>{marginSign}{marginStr}%</span>
                })()}
              </div>
            </div>
          )}

          {/* Switches */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Switch
                id="edit-is-popular"
                checked={isPopular}
                onCheckedChange={setIsPopular}
              />
              <Label htmlFor="edit-is-popular" className="cursor-pointer">
                Популярная пара
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="edit-is-active" className="cursor-pointer">
                Активен
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
