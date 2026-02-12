'use client'

import React from "react"

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  DollarSign, Settings, Plus, Minus, ArrowLeftRight, 
  Wallet, Building, CreditCard, Bitcoin, Loader2, EyeOff,
  GripVertical, MapPin, TrendingUp, TrendingDown, RefreshCw, Check, ChevronDown, Archive
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Cashbox } from '@/lib/types/database'
import { ExchangeDialog } from '@/components/finance/exchange-dialog'
import { TransactionList } from '@/components/finance/transaction-list'
import { AddCashboxDialog } from '@/components/finance/add-cashbox-dialog'
import { DepositWithdrawDialog } from '@/components/finance/deposit-withdraw-dialog'
import { EditCashboxDialog } from '@/components/finance/edit-cashbox-dialog'
import { TransferDialog } from '@/components/finance/transfer-dialog'
import { toast } from 'sonner'
import { updateCashboxSortOrders } from '@/app/actions/cashbox'

interface CashboxWithLocation extends Cashbox {
  location?: string | null
  holder_name?: string | null
  sort_order?: number
  is_exchange_enabled?: boolean
}

interface CurrencyRate {
  id: string
  code: string
  name: string
  symbol: string
  rate_to_rub: number | null
  rate_to_usd: number | null
  prev_rate_to_rub: number | null
  change_24h: number | null
  is_popular: boolean
}

const CASHBOX_TYPE_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  BANK: 'Банк',
  CRYPTO: 'Крипто',
  CARD: 'Карта',
  SAFE: 'Сейф',
  TRADE_IN: 'Trade-In',
}

const CASHBOX_TYPE_ICONS: Record<string, React.ReactNode> = {
  CASH: <Wallet className="h-3.5 w-3.5" />,
  BANK: <Building className="h-3.5 w-3.5" />,
  CRYPTO: <Bitcoin className="h-3.5 w-3.5" />,
  CARD: <CreditCard className="h-3.5 w-3.5" />,
  SAFE: <Wallet className="h-3.5 w-3.5" />,
  TRADE_IN: <CreditCard className="h-3.5 w-3.5" />,
}

const TYPE_COLORS: Record<string, string> = {
  CASH: 'bg-emerald-500',
  BANK: 'bg-blue-500',
  CRYPTO: 'bg-orange-500',
  CARD: 'bg-violet-500',
  SAFE: 'bg-amber-500',
  TRADE_IN: 'bg-purple-500',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  'RUB': '₽',
  'USD': '$',
  'EUR': '€',
  'KZT': '₸',
  'AED': 'د.إ',
  'UAH': '₴',
  'BTC': '₿',
  'ETH': 'Ξ',
  'XAU': 'Au',
}

export default function FinancePage() {
  const [cashboxes, setCashboxes] = useState<CashboxWithLocation[]>([])
  const [archivedCashboxes, setArchivedCashboxes] = useState<CashboxWithLocation[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [selectedCashbox, setSelectedCashbox] = useState<CashboxWithLocation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingCashbox, setEditingCashbox] = useState<CashboxWithLocation | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [totals, setTotals] = useState<{ income: number; expense: number; startOfDay: number }>({ income: 0, expense: 0, startOfDay: 0 })
  const [transactionRefreshKey, setTransactionRefreshKey] = useState(0)
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([])
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const [ratesUpdated, setRatesUpdated] = useState(false)
  const [ratesError, setRatesError] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    loadCashboxes()
    loadCurrencyRates()
    
    // Auto-refresh rates every 60 seconds (without toast)
    const ratesInterval = setInterval(() => {
      refreshRatesAuto()
    }, 60000)
    
    return () => clearInterval(ratesInterval)
  }, [])

  useEffect(() => {
    if (selectedCashbox) {
      loadTotals(selectedCashbox.id)
    }
  }, [selectedCashbox])

  const loadCashboxes = async () => {
    try {
      // Load active cashboxes
      const { data, error } = await supabase
        .from('cashboxes')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })
        .order('name')

if (error) throw error
  setCashboxes(data || [])
  
  if (data && data.length > 0) {
    if (!selectedCashbox) {
      setSelectedCashbox(data[0])
    } else {
      // Update selectedCashbox with fresh data (e.g., updated balance)
      const updatedSelected = data.find(c => c.id === selectedCashbox.id)
      if (updatedSelected) {
        setSelectedCashbox(updatedSelected)
      }
    }
  }

      // Load archived cashboxes
      const { data: archivedData } = await supabase
        .from('cashboxes')
        .select('*')
        .eq('is_archived', true)
        .order('name')
      
      setArchivedCashboxes(archivedData || [])
    } catch (error) {
      console.error('Error loading cashboxes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCurrencyRates = async () => {
    try {
      const { data } = await supabase
        .from('system_currency_rates')
        .select('*')
        .eq('is_popular', true)
        .order('sort_order')
      
      setCurrencyRates(data || [])
    } catch (error) {
      console.error('Error loading currency rates:', error)
    }
  }

  // Auto-refresh with same animation as manual refresh
  const refreshRatesAuto = async () => {
    setIsLoadingRates(true)
    setRatesUpdated(false)
    setRatesError(false)
    try {
      await fetchAndUpdateRates()
      // Show checkmark for 2 seconds
      setRatesUpdated(true)
      setTimeout(() => setRatesUpdated(false), 2000)
    } catch (error) {
      console.error('Auto refresh error:', error)
      setRatesError(true)
    } finally {
      setIsLoadingRates(false)
    }
  }

  // Manual refresh with loading indicator and checkmark
  const refreshRates = async () => {
    setIsLoadingRates(true)
    setRatesUpdated(false)
    setRatesError(false)
    try {
      await fetchAndUpdateRates()
      // Show checkmark for 2 seconds
      setRatesUpdated(true)
      setTimeout(() => setRatesUpdated(false), 2000)
    } catch (error) {
      console.error('Error refreshing rates:', error)
      setRatesError(true)
    } finally {
      setIsLoadingRates(false)
    }
  }

  const fetchAndUpdateRates = async () => {
    // Get fresh rates from DB first
    const { data: currentRates } = await supabase
      .from('system_currency_rates')
      .select('*')
      .eq('is_popular', true)
      .order('sort_order')
    
    if (!currentRates || currentRates.length === 0) return
    
    let hasError = false
    let fiatRates: Record<string, number> = {}
    let usdToRub = 90 // fallback
    
    // 1. Fetch fiat rates from multiple sources for reliability
    // Try Frankfurter API first (free, reliable, ECB data)
    try {
      const frankfurterResponse = await fetch('https://api.frankfurter.app/latest?from=RUB')
      if (frankfurterResponse.ok) {
        const data = await frankfurterResponse.json()
        // Frankfurter returns rates FROM RUB, so we need to invert
        for (const [code, rate] of Object.entries(data.rates)) {
          fiatRates[code] = 1 / (rate as number)
        }
        usdToRub = fiatRates['USD'] || 90
      }
    } catch (e) {
      console.error('Frankfurter API error:', e)
    }
    
    // Fallback to exchangerate-api if Frankfurter failed
    if (Object.keys(fiatRates).length === 0) {
      try {
        const fiatResponse = await fetch('https://api.exchangerate-api.com/v4/latest/RUB')
        if (fiatResponse.ok) {
          const fiatData = await fiatResponse.json()
          for (const [code, rate] of Object.entries(fiatData.rates)) {
            fiatRates[code] = 1 / (rate as number)
          }
          usdToRub = fiatRates['USD'] || 90
        } else {
          hasError = true
        }
      } catch (e) {
        console.error('ExchangeRate API error:', e)
        hasError = true
      }
    }
    
    // 2. Fetch crypto rates from CoinGecko (BTC, ETH in USD with 24h change)
    // Note: CoinGecko may block browser requests due to CORS, so we use fallback values
    let cryptoData: Record<string, { usd: number; usd_24h_change: number }> = {
      // Fallback values in case API fails
      'BTC': { usd: 95000, usd_24h_change: 0 },
      'ETH': { usd: 3500, usd_24h_change: 0 }
    }
    try {
      const cryptoResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
        { signal: AbortSignal.timeout(5000) } // 5 second timeout
      )
      if (cryptoResponse.ok) {
        const data = await cryptoResponse.json()
        if (data.bitcoin) {
          cryptoData['BTC'] = { 
            usd: data.bitcoin.usd, 
            usd_24h_change: data.bitcoin.usd_24h_change || 0 
          }
        }
        if (data.ethereum) {
          cryptoData['ETH'] = { 
            usd: data.ethereum.usd, 
            usd_24h_change: data.ethereum.usd_24h_change || 0 
          }
        }
      }
    } catch (e) {
      // API might fail due to CORS or rate limiting, fallback values will be used
      console.warn('Crypto API unavailable, using fallback values')
    }
    
    // 3. Fetch gold price from metals.live API
    let goldData: { usd: number } | null = null
    try {
      const goldResponse = await fetch('https://api.metals.live/v1/spot/gold')
      if (goldResponse.ok) {
        const gData = await goldResponse.json()
        if (gData && gData[0]?.price) {
          goldData = { usd: gData[0].price }
        }
      }
    } catch (e) {
      // Fallback: use approximate gold price
      goldData = { usd: 2650 }
    }
    
    // Get rates from 24 hours ago from history table for % change calculation
    const yesterday = new Date()
    yesterday.setHours(yesterday.getHours() - 24)
    
    const { data: historyRates } = await supabase
      .from('currency_rate_history')
      .select('code, rate_to_rub')
      .gte('recorded_at', yesterday.toISOString())
      .order('recorded_at', { ascending: true })
    
    // Create map of oldest rate in last 24h for each currency
    const rate24hAgo: Record<string, number> = {}
    historyRates?.forEach(h => {
      if (!rate24hAgo[h.code]) {
        rate24hAgo[h.code] = Number(h.rate_to_rub)
      }
    })
    
    // Update all rates in DB
    for (const rate of currentRates) {
      let newRateToRub: number | null = null
      let newRateToUsd: number | null = null
      let change24h: number | null = null
      
      if (rate.code === 'BTC' && cryptoData['BTC']) {
        newRateToUsd = cryptoData['BTC'].usd
        newRateToRub = cryptoData['BTC'].usd * usdToRub
        change24h = cryptoData['BTC'].usd_24h_change
      } else if (rate.code === 'ETH' && cryptoData['ETH']) {
        newRateToUsd = cryptoData['ETH'].usd
        newRateToRub = cryptoData['ETH'].usd * usdToRub
        change24h = cryptoData['ETH'].usd_24h_change
      } else if (rate.code === 'XAU' && goldData) {
        newRateToUsd = goldData.usd
        newRateToRub = goldData.usd * usdToRub
      } else if (fiatRates[rate.code]) {
        newRateToRub = fiatRates[rate.code]
      }
      
      // Calculate 24h change from history if not already set (for fiat/gold)
      if (change24h === null && newRateToRub && rate24hAgo[rate.code]) {
        const oldRate = rate24hAgo[rate.code]
        change24h = ((newRateToRub - oldRate) / oldRate) * 100
      }
      
      if (newRateToRub) {
        // Save to history for future 24h calculations (every hour max)
        const lastHistoryEntry = historyRates?.filter(h => h.code === rate.code).pop()
        const lastRecordedTime = lastHistoryEntry ? new Date(lastHistoryEntry.recorded_at as string) : null
        const oneHourAgo = new Date()
        oneHourAgo.setHours(oneHourAgo.getHours() - 1)
        
        if (!lastRecordedTime || lastRecordedTime < oneHourAgo) {
          await supabase.from('currency_rate_history').insert({
            code: rate.code,
            rate_to_rub: newRateToRub
          })
        }
        
        // Update current rate
        await supabase
          .from('system_currency_rates')
          .update({ 
            prev_rate_to_rub: rate.rate_to_rub,
            rate_to_rub: newRateToRub,
            rate_to_usd: newRateToUsd,
            change_24h: change24h,
            last_updated: new Date().toISOString() 
          })
          .eq('code', rate.code)
      }
    }
    
    // Clean up old history (keep only last 48 hours)
    const twoDaysAgo = new Date()
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48)
    await supabase
      .from('currency_rate_history')
      .delete()
      .lt('recorded_at', twoDaysAgo.toISOString())
    
    await loadCurrencyRates()
    
    if (hasError) {
      throw new Error('Some rates failed to update')
    }
  }

  const loadTotals = async (cashboxId: string) => {
    try {
      // Start of today (00:00)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      // Get today's transactions and current cashbox balance in parallel
      const [transactionsResult, cashboxResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, category')
          .eq('cashbox_id', cashboxId)
          .gte('created_at', startOfDay.toISOString()),
        supabase
          .from('cashboxes')
          .select('balance')
          .eq('id', cashboxId)
          .single()
      ])

      const todayTransactions = transactionsResult.data
      const currentBalance = cashboxResult.data ? Number(cashboxResult.data.balance) : 0

      // Calculate income (DEPOSIT, TRANSFER_IN, EXCHANGE_IN - positive amounts)
      // and expense (WITHDRAW, TRANSFER_OUT, EXCHANGE_OUT - negative amounts)
      let income = 0
      let expense = 0

      todayTransactions?.forEach(t => {
        const amount = Number(t.amount)
        if (amount > 0) {
          income += amount
        } else {
          expense += Math.abs(amount)
        }
      })

      // Calculate balance at start of day: current balance - today's income + today's expense
      const balanceAtStartOfDay = currentBalance - income + expense

      setTotals({ income, expense, startOfDay: balanceAtStartOfDay })
    } catch (error) {
      console.error('Error loading totals:', error)
    }
  }

  // Drag & Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    
    const newCashboxes = [...cashboxes]
    const draggedItem = newCashboxes[draggedIndex]
    newCashboxes.splice(draggedIndex, 1)
    newCashboxes.splice(index, 0, draggedItem)
    setCashboxes(newCashboxes)
    setDraggedIndex(index)
  }

  const handleDragEnd = async () => {
    if (draggedIndex === null) return
    
    try {
      const items = cashboxes.map((c, i) => ({ id: c.id, sort_order: i }))
      const result = await updateCashboxSortOrders({ items })
      
      if (!result.success) {
        toast.error(result.error || 'Ошибка сохранения порядка')
        return
      }
      
      toast.success('Порядок сохранен')
    } catch (error) {
      toast.error('Ошибка сохранения порядка')
    }
    
    setDraggedIndex(null)
  }

  const handleTransactionSuccess = async () => {
    // Trigger transaction list refresh immediately
    setTransactionRefreshKey(prev => prev + 1)
    
    // Reload totals and cashboxes in parallel for instant update
    if (selectedCashbox) {
      await Promise.all([
        loadCashboxes(),
        loadTotals(selectedCashbox.id)
      ])
    } else {
      await loadCashboxes()
    }
  }

  const formatBalance = (balance: number) => {
    return Math.abs(balance).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const currencySymbol = selectedCashbox ? (CURRENCY_SYMBOLS[selectedCashbox.currency] || selectedCashbox.currency) : '₽'

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  {'← Назад'}
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                <h1 className="text-xl font-semibold text-foreground">Финансы</h1>
              </div>
              <Link href="/exchange">
                <Button variant="outline" size="sm" className="bg-transparent text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Клиентский обмен
                </Button>
              </Link>
            </div>
            
            {/* Currency Rates in Header */}
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">
                {currencyRates.slice(0, 6).map((rate) => {
                  const isCryptoOrGold = ['BTC', 'ETH', 'XAU'].includes(rate.code)
                  const displayValue = isCryptoOrGold && rate.rate_to_usd 
                    ? `$${rate.rate_to_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    : rate.rate_to_rub 
                      ? `${rate.rate_to_rub.toFixed(2)} ₽`
                      : '—'
                  const change = rate.change_24h
                  const isPositive = change !== null && change > 0
                  const isNegative = change !== null && change < 0
                  
                  return (
                    <div key={rate.id} className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-muted-foreground w-5">{rate.symbol}</span>
                      <span className="font-mono text-foreground min-w-[60px]">
                        {displayValue}
                      </span>
                      {change !== null && change !== undefined && change !== 0 ? (
                        <span className={`font-mono text-[10px] ${
                          isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-muted-foreground'
                        }`}>
                          {isPositive ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">0.00%</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {ratesError && (
                <span className="text-xs font-mono text-red-500 font-semibold">Err</span>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 ml-1"
                onClick={refreshRates}
                disabled={isLoadingRates}
              >
                {ratesUpdated ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRates ? 'animate-spin' : ''} ${ratesError ? 'text-red-400' : ''}`} />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Sidebar - Cashbox List */}
          <div className="w-72 flex-shrink-0 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {cashboxes.map((cashbox, index) => (
                  <div
                    key={cashbox.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedCashbox(cashbox)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all group ${
                      selectedCashbox?.id === cashbox.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/30'
                    } ${draggedIndex === index ? 'opacity-50' : ''}`}
                  >
<div className="flex gap-2 h-full">
                      {/* Левая колонка: GripVertical сверху, Settings снизу */}
                      <div className="flex flex-col justify-between items-center flex-shrink-0 py-0.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingCashbox(cashbox)
                          }}
                        >
                          <Settings className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-foreground text-sm truncate">
                              {cashbox.name}
                            </span>
                            {cashbox.is_hidden && (
                              <EyeOff className="h-3 w-3 text-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 ${TYPE_COLORS[cashbox.type] || 'bg-zinc-500'}`}>
                            {CASHBOX_TYPE_ICONS[cashbox.type] || <Wallet className="h-3 w-3" />}
                          </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {CASHBOX_TYPE_LABELS[cashbox.type] || cashbox.type}
                        </p>
                        
                        {/* Локация */}
                        {cashbox.location && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{cashbox.location}</span>
                          </div>
                        )}
                        
                        {/* Баланс справа внизу */}
                        <div className="mt-2 flex justify-end">
                          <span className={`font-mono font-semibold text-sm ${
                            Number(cashbox.balance) >= 0 ? 'text-foreground' : 'text-red-400'
                          }`}>
                            {CURRENCY_SYMBOLS[cashbox.currency] || ''} {formatBalance(Number(cashbox.balance))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Cashbox Button */}
                <AddCashboxDialog onSuccess={loadCashboxes}>
                  <Button variant="outline" className="w-full border-dashed bg-transparent rounded-xl">
                    <Plus className="h-4 w-4 mr-2" />
                    Счет
                  </Button>
                </AddCashboxDialog>

                {/* Archived Cashboxes Section */}
                {archivedCashboxes.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setShowArchived(!showArchived)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                      <Archive className="h-3.5 w-3.5" />
                      <span>Архивные кассы ({archivedCashboxes.length})</span>
                    </button>
                    
                    {showArchived && (
                      <div className="space-y-2 mt-2">
                        {archivedCashboxes.map((cashbox) => (
                          <div
                            key={cashbox.id}
                            onClick={() => setEditingCashbox(cashbox)}
                            className="p-3 rounded-xl border border-border/50 bg-card/50 cursor-pointer hover:border-muted-foreground/30 transition-all opacity-60 hover:opacity-80"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${TYPE_COLORS[cashbox.type] || 'bg-zinc-500'}`}>
                                  {CASHBOX_TYPE_ICONS[cashbox.type] || <Wallet className="h-2.5 w-2.5" />}
                                </div>
                                <span className="font-medium text-foreground/70 text-sm">
                                  {cashbox.name}
                                </span>
                              </div>
                              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-7">
                              {CASHBOX_TYPE_LABELS[cashbox.type] || cashbox.type}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Panel */}
          <div className="flex-1 min-w-0 space-y-4">
            {selectedCashbox ? (
              <>
                {/* Header with actions */}
                <div className="flex gap-4">
                  <Card className="border-border rounded-xl flex-1">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        Транзакции: {selectedCashbox.name}
                      </CardTitle>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-3">
                        <DepositWithdrawDialog type="DEPOSIT" cashboxId={selectedCashbox.id} onSuccess={handleTransactionSuccess}>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Plus className="h-4 w-4 mr-1" />
                            Приход
                          </Button>
                        </DepositWithdrawDialog>
                        <DepositWithdrawDialog type="WITHDRAW" cashboxId={selectedCashbox.id} onSuccess={handleTransactionSuccess}>
                          <Button size="sm" variant="destructive">
                            <Minus className="h-4 w-4 mr-1" />
                            Расход
                          </Button>
                        </DepositWithdrawDialog>
                        <TransferDialog fromCashbox={selectedCashbox} onSuccess={handleTransactionSuccess} />
                      </div>
                    </CardHeader>
                  </Card>

                  {/* Exchange - Moved to top */}
                  <ExchangeDialog onSuccess={handleTransactionSuccess}>
                    <Card className="rounded-xl border-blue-500/20 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 transition-colors w-48">
                      <CardContent className="p-4 h-full flex flex-col items-center justify-center">
                        <div className="p-2 rounded-lg bg-blue-500/20 mb-2">
                          <ArrowLeftRight className="h-5 w-5 text-blue-400" />
                        </div>
                        <p className="text-xs text-muted-foreground">Обмен валют</p>
                        <p className="text-sm font-medium text-blue-400">Открыть обмен</p>
                      </CardContent>
                    </Card>
                  </ExchangeDialog>
                </div>

                {/* Stats Row - 3 compact cards */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Income - Today */}
                  <div className="rounded-xl bg-card border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      </div>
                      <span className="text-xs text-muted-foreground">Поступления за день</span>
                    </div>
                    <p className="font-mono font-bold text-xl text-emerald-400 pl-1">
                      +{currencySymbol} {totals.income.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Expense - Today */}
                  <div className="rounded-xl bg-card border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-red-500/20">
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      </div>
                      <span className="text-xs text-muted-foreground">Расходы за день</span>
                    </div>
                    <p className="font-mono font-bold text-xl text-red-400 pl-1">
                      -{currencySymbol} {totals.expense.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Balance at Start of Day */}
                  <div className="rounded-xl bg-card border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-zinc-500/20">
                        <Wallet className="h-4 w-4 text-zinc-400" />
                      </div>
                      <span className="text-xs text-muted-foreground">На начало дня</span>
                    </div>
                    <p className={`font-mono font-bold text-xl pl-1 ${totals.startOfDay >= 0 ? 'text-foreground' : 'text-red-400'}`}>
                      {currencySymbol} {totals.startOfDay.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Transactions */}
                <Card className="rounded-xl border-border">
                  <CardContent className="p-4">
                    <TransactionList cashboxId={selectedCashbox.id} refreshKey={transactionRefreshKey} />
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Выберите кассу для просмотра транзакций
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      {editingCashbox && (
        <EditCashboxDialog
          cashbox={editingCashbox}
          open={!!editingCashbox}
          onOpenChange={(open) => {
            if (!open) {
              setEditingCashbox(null)
              loadCashboxes()
            }
          }}
        />
      )}
    </div>
  )
}
