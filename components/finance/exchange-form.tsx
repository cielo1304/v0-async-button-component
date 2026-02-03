'use client'

import { useState, useEffect, useCallback } from 'react'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Cashbox, CurrencyRate } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { executeExchange } from '@/app/actions/exchange'
import { refreshCurrencyRates, getExchangeRate } from '@/app/actions/currency-rates'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const DEFAULT_RATES_TO_USD = {
  RUB: 0.0136, // Примерный курс рубля к доллару
  USD: 1,
  USDT: 1,
  EUR: 1.09,
  // Добавьте другие валюты по необходимости
}

interface ExchangeFormProps {
  compact?: boolean
}

export function ExchangeForm({ compact = false }: ExchangeFormProps) {
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([])
  const [fromBoxId, setFromBoxId] = useState('')
  const [toBoxId, setToBoxId] = useState('')
  const [sentAmount, setSentAmount] = useState<number | null>(null)
  const [rate, setRate] = useState<number | null>(1.0)
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingRate, setIsLoadingRate] = useState(false)
  const [rateSource, setRateSource] = useState<string>('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const loadCashboxes = useCallback(async () => {
    const { data, error } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_archived', false)
      .order('name')

    if (error) {
      return
    }
    if (data) setCashboxes(data)
  }, [supabase])

  const loadCurrencyRates = useCallback(async () => {
    const { data, error } = await supabase
      .from('currency_rates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return
    }
    if (data) setCurrencyRates(data)
  }, [supabase])

  // Функция получения курса между двумя валютами
  const getRate = useCallback((fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1

    // Ищем прямой курс в БД
    const directRate = currencyRates.find(
      r => r.from_currency === fromCurrency && r.to_currency === toCurrency
    )
    if (directRate) return Number(directRate.rate)

    // Ищем обратный курс в БД
    const reverseRate = currencyRates.find(
      r => r.from_currency === toCurrency && r.to_currency === fromCurrency
    )
    if (reverseRate) return 1 / Number(reverseRate.rate)

    // Конвертация через USD (базовые курсы)
    const fromToUsd = DEFAULT_RATES_TO_USD[fromCurrency] || 1
    const toToUsd = DEFAULT_RATES_TO_USD[toCurrency] || 1
    return fromToUsd / toToUsd
  }, [currencyRates])

  // Функция обновления курса с внешнего API
  const fetchLiveRate = useCallback(async (fromCurrency: string, toCurrency: string) => {
    setIsLoadingRate(true)
    try {
      // Сначала обновляем курсы из внешнего API
      const refreshResult = await refreshCurrencyRates()
      
      if (refreshResult.success) {
        // Получаем актуальный курс
        const rateResult = await getExchangeRate(fromCurrency, toCurrency)
        setRate(Math.round(rateResult.rate * 10000) / 10000)
        setRateSource(rateResult.source)
        
        const sourceLabel = rateResult.source === 'exchangerate-api.com' ? 'Exchange Rate API' : rateResult.source
        toast.success(`Курс обновлен: 1 ${fromCurrency} = ${rateResult.rate.toFixed(4)} ${toCurrency} (${sourceLabel})`)
        
        // Перезагружаем курсы из БД
        loadCurrencyRates()
      } else {
        // Используем курсы из БД
        const calculatedRate = getRate(fromCurrency, toCurrency)
        setRate(Math.round(calculatedRate * 10000) / 10000)
        setRateSource('database')
        toast.info(`Используется курс из базы данных: 1 ${fromCurrency} = ${calculatedRate.toFixed(4)} ${toCurrency}`)
      }
    } catch {
      // Fallback на локальный курс
      const calculatedRate = getRate(fromCurrency, toCurrency)
      setRate(Math.round(calculatedRate * 10000) / 10000)
      setRateSource('fallback')
      toast.error('Не удалось получить актуальный курс, используется резервный')
    } finally {
      setIsLoadingRate(false)
    }
  }, [getRate, loadCurrencyRates])

  useEffect(() => {
    loadCashboxes()
    loadCurrencyRates()
  }, [loadCashboxes, loadCurrencyRates])

  // Автоматически обновляем курс при выборе касс
  useEffect(() => {
    if (fromBoxId && toBoxId) {
      const fromBox = cashboxes.find(b => b.id === fromBoxId)
      const toBox = cashboxes.find(b => b.id === toBoxId)
      if (fromBox && toBox) {
        const calculatedRate = getRate(fromBox.currency, toBox.currency)
        setRate(Math.round(calculatedRate * 10000) / 10000)
      }
    }
  }, [fromBoxId, toBoxId, cashboxes, getRate])

  useEffect(() => {
    if (sentAmount && rate) {
      const calculated = sentAmount * rate
      setReceivedAmount(Math.round(calculated * 100) / 100)
    }
  }, [sentAmount, rate])

  const handleSubmit = async () => {
    setMessage(null)
    
    if (!fromBoxId || !toBoxId || !sentAmount || !rate) {
      setMessage({ type: 'error', text: 'Заполните все обязательные поля' })
      return
    }

    if (fromBoxId === toBoxId) {
      setMessage({ type: 'error', text: 'Нельзя обменивать в ту же кассу' })
      return
    }

    setIsLoading(true)

    try {
      const result = await executeExchange({
        fromBoxId,
        toBoxId,
        sentAmount,
        receivedAmount: receivedAmount || sentAmount * rate,
        rate,
        fee: 0,
        description: description || undefined,
      })

      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Обмен выполнен успешно!' })
        setSentAmount(null)
        setReceivedAmount(null)
        setDescription('')
        // Перезагружаем кассы для обновления балансов
        await loadCashboxes()
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error || 'Ошибка при выполнении обмена' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Произошла ошибка при выполнении обмена' })
    } finally {
      setIsLoading(false)
    }
  }

  const fromBox = cashboxes.find(b => b.id === fromBoxId)
  const toBox = cashboxes.find(b => b.id === toBoxId)

  // Compact mode - just a link to open exchange dialog
  if (compact) {
    return (
      <button 
        onClick={() => {
          // Navigate or open dialog
          window.location.href = '/finance?exchange=true'
        }}
        className="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
      >
        Открыть обмен
      </button>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <Card className={`p-4 flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Из кассы</Label>
          <Select value={fromBoxId} onValueChange={setFromBoxId}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder="Выберите кассу" />
            </SelectTrigger>
            <SelectContent>
              {cashboxes.map((box) => (
                <SelectItem key={box.id} value={box.id}>
                  {box.name} ({box.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fromBox && (
            <Card className="p-3 bg-secondary/50 border-border">
              <div className="text-sm">
                <div className="text-muted-foreground">Баланс:</div>
                <div className="font-mono font-semibold text-foreground">
                  {Number(fromBox.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {fromBox.currency}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">В кассу</Label>
          <Select value={toBoxId} onValueChange={setToBoxId}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder="Выберите кассу" />
            </SelectTrigger>
            <SelectContent>
              {cashboxes.map((box) => (
                <SelectItem key={box.id} value={box.id}>
                  {box.name} ({box.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {toBox && (
            <Card className="p-3 bg-secondary/50 border-border">
              <div className="text-sm">
                <div className="text-muted-foreground">Баланс:</div>
                <div className="font-mono font-semibold text-foreground">
                  {Number(toBox.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {toBox.currency}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <Label className="text-muted-foreground">Сумма списания</Label>
          <MoneyInput
            value={sentAmount}
            onValueChange={setSentAmount}
            currency={(fromBox?.currency as 'RUB' | 'USD' | 'USDT' | 'EUR') || 'RUB'}
          />
        </div>

        <div className="flex items-center justify-center pt-6">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="flex-1 space-y-2">
          <Label className="text-muted-foreground">Сумма зачисления</Label>
          <MoneyInput
            value={receivedAmount}
            onValueChange={setReceivedAmount}
            currency={(toBox?.currency as 'RUB' | 'USD' | 'USDT' | 'EUR') || 'RUB'}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Курс обмена</Label>
        <div className="flex items-center gap-2">
          <MoneyInput
            value={rate}
            onValueChange={setRate}
            currency={(toBox?.currency as 'RUB' | 'USD' | 'USDT' | 'EUR') || 'RUB'}
            showCurrency={false}
          />
          <button
            type="button"
            onClick={() => fromBox && toBox && fetchLiveRate(fromBox.currency, toBox.currency)}
            disabled={!fromBox || !toBox || isLoadingRate}
            className="p-2 rounded hover:bg-secondary transition-colors disabled:opacity-50"
            title="Обновить курс"
          >
            {isLoadingRate ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {'1 '}{fromBox?.currency || '?'}{' = '}{rate?.toFixed(4) || '?'}{' '}{toBox?.currency || '?'}
        </p>
        {fromBox && toBox && fromBox.currency !== toBox.currency && (
          <p className={`text-xs ${
            rateSource === 'exchangerate-api.com' || rateSource === 'api' 
              ? 'text-emerald-400' 
              : rateSource === 'database' 
                ? 'text-blue-400'
                : 'text-amber-400'
          }`}>
            {rateSource === 'exchangerate-api.com' || rateSource === 'api' 
              ? 'Актуальный курс (Exchange Rate API)'
              : rateSource === 'database'
                ? 'Курс из базы данных'
                : rateSource === 'fallback'
                  ? 'Резервный курс'
                  : 'Нажмите для обновления курса'}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Комментарий (опционально)</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание операции обмена"
          rows={3}
          className="bg-secondary border-border"
        />
      </div>

      <AsyncButton
        onClick={handleSubmit}
        className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
        size="lg"
        isLoading={isLoading}
        loadingText="Выполняется обмен..."
      >
        Выполнить обмен
      </AsyncButton>
    </div>
  )
}
