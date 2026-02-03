'use client'

import React from "react"

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Cashbox, CurrencyRate } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, RefreshCw, ArrowLeftRight, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { executeExchange } from '@/app/actions/exchange'
import { refreshCurrencyRates, getExchangeRate } from '@/app/actions/currency-rates'
import { toast } from 'sonner'

const DEFAULT_RATES_TO_USD: Record<string, number> = {
  RUB: 0.0136,
  USD: 1,
  USDT: 1,
  EUR: 1.09,
}

interface ExchangeDialogProps {
  children?: React.ReactNode
  onSuccess?: () => void
}

export function ExchangeDialog({ children, onSuccess }: ExchangeDialogProps) {
  const [open, setOpen] = useState(false)
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
  const supabase = useMemo(() => createClient(), [])

  const loadCashboxes = useCallback(async () => {
    const { data } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_archived', false)
      .eq('is_exchange_enabled', true)
      .order('name')
    if (data) setCashboxes(data)
  }, [supabase])

  const loadCurrencyRates = useCallback(async () => {
    const { data } = await supabase
      .from('currency_rates')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setCurrencyRates(data)
  }, [supabase])

  const getRate = useCallback((fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1

    const directRate = currencyRates.find(
      r => r.from_currency === fromCurrency && r.to_currency === toCurrency
    )
    if (directRate) return Number(directRate.rate)

    const reverseRate = currencyRates.find(
      r => r.from_currency === toCurrency && r.to_currency === fromCurrency
    )
    if (reverseRate) return 1 / Number(reverseRate.rate)

    const fromToUsd = DEFAULT_RATES_TO_USD[fromCurrency] || 1
    const toToUsd = DEFAULT_RATES_TO_USD[toCurrency] || 1
    return fromToUsd / toToUsd
  }, [currencyRates])

  const fetchLiveRate = useCallback(async (fromCurrency: string, toCurrency: string) => {
    setIsLoadingRate(true)
    try {
      const refreshResult = await refreshCurrencyRates()
      if (refreshResult.success) {
        const rateResult = await getExchangeRate(fromCurrency, toCurrency)
        setRate(Math.round(rateResult.rate * 10000) / 10000)
        toast.success(`Курс обновлен: 1 ${fromCurrency} = ${rateResult.rate.toFixed(4)} ${toCurrency}`)
        loadCurrencyRates()
      } else {
        const calculatedRate = getRate(fromCurrency, toCurrency)
        setRate(Math.round(calculatedRate * 10000) / 10000)
      }
    } catch {
      const calculatedRate = getRate(fromCurrency, toCurrency)
      setRate(Math.round(calculatedRate * 10000) / 10000)
    } finally {
      setIsLoadingRate(false)
    }
  }, [getRate, loadCurrencyRates])

  useEffect(() => {
    if (open) {
      loadCashboxes()
      loadCurrencyRates()
    }
  }, [open, loadCashboxes, loadCurrencyRates])

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
      setReceivedAmount(Math.round(sentAmount * rate * 100) / 100)
    }
  }, [sentAmount, rate])

  const handleSubmit = async () => {
    if (!fromBoxId || !toBoxId || !sentAmount || !rate) {
      toast.error('Заполните все обязательные поля')
      return
    }

    if (fromBoxId === toBoxId) {
      toast.error('Нельзя обменивать в ту же кассу')
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
        toast.success('Обмен выполнен успешно!')
        setOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(result.error || 'Ошибка при выполнении обмена')
      }
    } catch {
      toast.error('Произошла ошибка при выполнении обмена')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFromBoxId('')
    setToBoxId('')
    setSentAmount(null)
    setReceivedAmount(null)
    setRate(1.0)
    setDescription('')
  }

  const fromBox = cashboxes.find(b => b.id === fromBoxId)
  const toBox = cashboxes.find(b => b.id === toBoxId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="bg-transparent">
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Обмен валют
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Обмен валют</DialogTitle>
          <DialogDescription>
            Конвертация средств между кассами с разными валютами
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Из кассы</Label>
              <Select value={fromBoxId} onValueChange={setFromBoxId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Выберите" />
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
                <Card className="p-2 bg-secondary/50 border-border">
                  <div className="text-xs text-muted-foreground">Баланс:</div>
                  <div className="font-mono font-semibold text-sm text-foreground">
                    {Number(fromBox.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {fromBox.currency}
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">В кассу</Label>
              <Select value={toBoxId} onValueChange={setToBoxId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Выберите" />
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
                <Card className="p-2 bg-secondary/50 border-border">
                  <div className="text-xs text-muted-foreground">Баланс:</div>
                  <div className="font-mono font-semibold text-sm text-foreground">
                    {Number(toBox.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {toBox.currency}
                  </div>
                </Card>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-muted-foreground">Списать</Label>
              <MoneyInput
                value={sentAmount}
                onValueChange={setSentAmount}
                currency={(fromBox?.currency as 'RUB' | 'USD' | 'USDT' | 'EUR') || 'RUB'}
              />
            </div>

            <ArrowRight className="h-5 w-5 text-muted-foreground mt-6" />

            <div className="flex-1 space-y-2">
              <Label className="text-muted-foreground">Зачислить</Label>
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fromBox && toBox && fetchLiveRate(fromBox.currency, toBox.currency)}
                disabled={!fromBox || !toBox || isLoadingRate}
              >
                {isLoadingRate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              1 {fromBox?.currency || '?'} = {rate?.toFixed(4) || '?'} {toBox?.currency || '?'}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Комментарий</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание операции"
              rows={2}
              className="bg-secondary border-border"
            />
          </div>

          <AsyncButton
            onClick={handleSubmit}
            className="w-full"
            isLoading={isLoading}
            loadingText="Выполняется..."
          >
            Выполнить обмен
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
