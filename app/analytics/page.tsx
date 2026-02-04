'use client'

import { SelectItem } from "@/components/ui/select"

import { SelectContent } from "@/components/ui/select"

import { SelectValue } from "@/components/ui/select"

import { SelectTrigger } from "@/components/ui/select"

import { Select } from "@/components/ui/select"

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TrendingUp, TrendingDown, DollarSign, Car, Package, Briefcase, Users, ArrowLeft, RefreshCw, Loader2, Calendar, Check, ChevronUp, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, subYears, startOfDay, endOfDay, getMonth, getYear } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

type Period = 'today' | 'this_week' | 'this_month' | 'this_year' | 'yesterday' | 'last_week' | 'last_month' | 'last_year' | 'all' | 'custom'

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Custom Calendar Component - 1 в 1 как в transaction-list.tsx
function CustomCalendar({ 
  selected, 
  onSelect,
  onClose
}: { 
  selected: DateRange
  onSelect: (range: DateRange) => void
  onClose: () => void
}) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(selected.from ? getMonth(selected.from) : getMonth(today))
  const [viewYear, setViewYear] = useState(selected.from ? getYear(selected.from) : getYear(today))
  const [selectingStart, setSelectingStart] = useState(true)
  const [tempRange, setTempRange] = useState<DateRange>(selected)
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()
  
  const handleDayClick = (day: number) => {
    const clickedDate = new Date(viewYear, viewMonth, day)
    
    if (selectingStart) {
      setTempRange({ from: clickedDate, to: undefined })
      setSelectingStart(false)
    } else {
      if (tempRange.from && clickedDate < tempRange.from) {
        setTempRange({ from: clickedDate, to: tempRange.from })
      } else {
        setTempRange({ from: tempRange.from, to: clickedDate })
      }
      setSelectingStart(true)
    }
  }

  const handleApply = () => {
    if (tempRange.from && tempRange.to) {
      onSelect(tempRange)
      onClose()
    }
  }

  const isInRange = (day: number) => {
    if (!tempRange.from) return false
    const date = new Date(viewYear, viewMonth, day)
    if (tempRange.to) {
      return date >= tempRange.from && date <= tempRange.to
    }
    return date.getTime() === tempRange.from.getTime()
  }

  const isRangeStart = (day: number) => {
    if (!tempRange.from) return false
    const date = new Date(viewYear, viewMonth, day)
    return date.getTime() === tempRange.from.getTime()
  }

  const isRangeEnd = (day: number) => {
    if (!tempRange.to) return false
    const date = new Date(viewYear, viewMonth, day)
    return date.getTime() === tempRange.to.getTime()
  }

  const isToday = (day: number) => {
    const date = new Date(viewYear, viewMonth, day)
    return date.toDateString() === today.toDateString()
  }

  return (
    <div className="p-4 min-w-[320px]">
      <div className="flex items-center justify-between mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear(viewYear - 1)
            } else {
              setViewMonth(viewMonth - 1)
            }
          }}
        >
          <ChevronDown className="h-4 w-4 rotate-90" />
        </Button>
        
        <div className="flex items-center gap-2">
          <DropdownMenu open={monthDropdownOpen} onOpenChange={setMonthDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 font-medium bg-transparent">
                {MONTHS_RU[viewMonth]}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-[300px] overflow-y-auto">
              {MONTHS_RU.map((month, idx) => (
                <DropdownMenuItem 
                  key={month} 
                  onClick={() => { setViewMonth(idx); setMonthDropdownOpen(false) }}
                  className="flex items-center gap-2"
                >
                  {viewMonth === idx && <Check className="h-4 w-4" />}
                  <span className={viewMonth === idx ? 'font-medium' : ''}>{month}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center border rounded-md">
            <span className="px-2 font-mono text-sm">{viewYear}</span>
            <div className="flex flex-col border-l">
              <button 
                className="px-1 py-0.5 hover:bg-secondary/50 transition-colors"
                onClick={() => setViewYear(viewYear + 1)}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button 
                className="px-1 py-0.5 hover:bg-secondary/50 transition-colors border-t"
                onClick={() => setViewYear(viewYear - 1)}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear(viewYear + 1)
            } else {
              setViewMonth(viewMonth + 1)
            }
          }}
        >
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </Button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_RU.map(day => (
          <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`prev-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {prevMonthDays - startOffset + i + 1}
          </div>
        ))}
        
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const inRange = isInRange(day)
          const isStart = isRangeStart(day)
          const isEnd = isRangeEnd(day)
          const isTodayDate = isToday(day)
          
          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className={`
                text-center py-2 text-sm rounded-md transition-colors
                ${inRange ? 'bg-primary/20' : 'hover:bg-secondary/50'}
                ${isStart || isEnd ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
                ${isTodayDate && !inRange ? 'ring-1 ring-primary' : ''}
              `}
            >
              {day}
            </button>
          )
        })}
        
        {Array.from({ length: 42 - startOffset - daysInMonth }).map((_, i) => (
          <div key={`next-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {i + 1}
          </div>
        ))}
      </div>
      
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {tempRange.from && tempRange.to ? (
            `${format(tempRange.from, 'dd.MM.yyyy')} — ${format(tempRange.to, 'dd.MM.yyyy')}`
          ) : tempRange.from ? (
            `${format(tempRange.from, 'dd.MM.yyyy')} — выберите конец`
          ) : (
            'Выберите начало периода'
          )}
        </div>
        <Button 
          size="sm" 
          onClick={handleApply}
          disabled={!tempRange.from || !tempRange.to}
        >
          Применить
        </Button>
      </div>
    </div>
  )
}

interface AnalyticsData {
  // Финансы
  totalBalance: number
  balanceByСurrency: { currency: string; amount: number }[]
  transactionsCount: number
  incomeTotal: number
  expenseTotal: number
  dailyTransactions: { date: string; income: number; expense: number }[]
  
  // Авто
  carsInStock: number
  carsSold: number
  carsTotal: number
  carsByStatus: { status: string; count: number }[]
  totalMargin: number
  avgMargin: number
  
  // Прибыль
  totalProfit: number
  avgProfit: number
  profitDealsCount: number
  
  // Сделки
  dealsActive: number
  dealsCompleted: number
  dealsPending: number
  dealsTotal: number
  dealsByStatus: { status: string; count: number }[]
  totalRevenue: number
  totalDebt: number
  
  // Склад
  stockItems: number
  lowStockItems: number
  stockValue: number
  
  // HR
  employeesCount: number
  totalSalaryDebt: number
  
  // Автоплощадка
  autoClientsCount: number
  autoDealsTotal: number
  autoDealsActive: number
  autoDealsOverdue: number
  autoTotalRevenue: number
  autoTotalDebt: number
  autoCommissionEarned: number
  autoDealsByType: { type: string; count: number }[]
}

const COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#8b5cf6',
  zinc: '#71717a',
}

const PIE_COLORS = [COLORS.emerald, COLORS.blue, COLORS.amber, COLORS.red, COLORS.violet]

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('this_month')
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const supabase = createClient()

  // Получение лейбла периода
  const getPeriodLabel = (p: Period): string => {
    switch (p) {
      case 'today': return 'Сегодня'
      case 'this_week': return 'Эта неделя'
      case 'this_month': return 'Этот месяц'
      case 'this_year': return 'Этот год'
      case 'yesterday': return 'Вчера'
      case 'last_week': return 'Прошлая неделя'
      case 'last_month': return 'Прошлый месяц'
      case 'last_year': return 'Прошлый год'
      case 'custom':
        if (customDateRange.from && customDateRange.to) {
          return `${format(customDateRange.from, 'dd.MM.yy')} - ${format(customDateRange.to, 'dd.MM.yy')}`
        }
        return 'Выбрать даты'
      case 'all': return 'Все время'
      default: return 'Этот месяц'
    }
  }

  // Получение диапазона дат по периоду
  const getDateRangeForPeriod = useCallback((p: Period): { start: Date; end: Date } | null => {
    const now = new Date()
    switch (p) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) }
      case 'yesterday':
        const yesterday = subDays(now, 1)
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
      case 'this_week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
      case 'last_week':
        const lastWeek = subWeeks(now, 1)
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) }
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) }
      case 'last_month':
        const lastMonth = subMonths(now, 1)
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) }
      case 'this_year':
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
      case 'last_year':
        return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) }
      case 'custom':
        if (customDateRange.from && customDateRange.to) {
          return { start: startOfDay(customDateRange.from), end: endOfDay(customDateRange.to) }
        }
        return null
      case 'all':
        return null
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) }
    }
  }, [customDateRange])

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true)
    
    try {
      // Определяем даты периода
      const dateRange = getDateRangeForPeriod(period)
      const startDateStr = dateRange ? format(dateRange.start, 'yyyy-MM-dd') : null

      // Базовые запросы
      let transactionsQuery = supabase.from('transactions').select('*').order('created_at', { ascending: true })
      if (startDateStr) {
        transactionsQuery = transactionsQuery.gte('created_at', startDateStr)
      }

      // Параллельные запросы
      const [
        cashboxesRes,
        transactionsRes,
        carsRes,
        dealsRes,
        stockRes,
        employeesRes,
        autoClientsRes,
        autoDealsRes,
      ] = await Promise.all([
        supabase.from('cashboxes').select('*').eq('is_archived', false),
        transactionsQuery,
        supabase.from('cars').select('*'),
        supabase.from('deals').select('*'),
        supabase.from('stock_items').select('*').eq('is_active', true),
        supabase.from('employees').select('*').eq('is_active', true),
        supabase.from('auto_clients').select('*'),
        supabase.from('auto_deals').select('*'),
      ])

      const cashboxes = cashboxesRes.data || []
      const transactions = transactionsRes.data || []
      const cars = carsRes.data || []
      const deals = dealsRes.data || []
      const stockItems = stockRes.data || []
      const employees = employeesRes.data || []
      const autoClients = autoClientsRes.data || []
      const autoDeals = autoDealsRes.data || []

      // Обработка финансов
      const balanceByСurrency = cashboxes.reduce((acc, cb) => {
        const existing = acc.find(b => b.currency === cb.currency)
        if (existing) {
          existing.amount += Number(cb.balance)
        } else {
          acc.push({ currency: cb.currency, amount: Number(cb.balance) })
        }
        return acc
      }, [] as { currency: string; amount: number }[])

      const totalBalance = cashboxes.reduce((sum, cb) => {
        // Конвертируем в USD для общего баланса
        const rate = cb.currency === 'USD' || cb.currency === 'USDT' ? 1 : cb.currency === 'EUR' ? 1.08 : 0.0108
        return sum + Number(cb.balance) * rate
      }, 0)

      const incomeCategories = ['DEPOSIT', 'DEAL_PAYMENT', 'EXCHANGE_IN', 'TRANSFER_IN']
      const incomeTotal = transactions
        .filter(t => incomeCategories.includes(t.category))
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
      
      const expenseTotal = transactions
        .filter(t => !incomeCategories.includes(t.category))
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

      // Группировка транзакций по дням
      const dailyMap = new Map<string, { income: number; expense: number }>()
      transactions.forEach(t => {
        const day = format(new Date(t.created_at), 'dd.MM')
        const existing = dailyMap.get(day) || { income: 0, expense: 0 }
        if (incomeCategories.includes(t.category)) {
          existing.income += Math.abs(Number(t.amount))
        } else {
          existing.expense += Math.abs(Number(t.amount))
        }
        dailyMap.set(day, existing)
      })
      const dailyTransactions = Array.from(dailyMap.entries()).map(([date, values]) => ({
        date,
        income: values.income,
        expense: values.expense,
      }))

      // Обработка авто
      const carsInStock = cars.filter(c => c.status === 'IN_STOCK').length
      const carsSold = cars.filter(c => c.status === 'SOLD').length
      const carsByStatus = [
        { status: 'На складе', count: carsInStock },
        { status: 'Продано', count: carsSold },
        { status: 'Подготовка', count: cars.filter(c => c.status === 'PREP').length },
        { status: 'Резерв', count: cars.filter(c => c.status === 'RESERVED').length },
        { status: 'В пути', count: cars.filter(c => c.status === 'IN_TRANSIT').length },
      ].filter(s => s.count > 0)

      // Прибыль считается из поля margin_amount в сделках
      // margin_amount = total_amount - cost_price (рассчитывается при создании сделки)
      const dealsWithMargin = deals.filter(d => d.margin_amount !== null && d.margin_amount !== undefined)
      const completedDealsWithMargin = deals.filter(d => 
        (d.status === 'COMPLETED' || d.status === 'PAID') && d.margin_amount
      )
      
      // Общая прибыль по завершенным сделкам
      const totalProfit = completedDealsWithMargin.reduce((sum, d) => sum + Number(d.margin_amount || 0), 0)
      const profitDealsCount = completedDealsWithMargin.length
      const avgProfit = profitDealsCount > 0 ? totalProfit / profitDealsCount : 0
      
      // Потенциальная прибыль по всем сделкам (включая незавершенные)
      const potentialProfit = dealsWithMargin.reduce((sum, d) => sum + Number(d.margin_amount || 0), 0)
      
      // Маржа по авто (list_price - cost_price)
      const carsWithPrices = cars.filter(c => c.list_price && c.cost_price)
      const totalMargin = carsWithPrices.reduce((sum, c) => sum + (Number(c.list_price || 0) - Number(c.cost_price || 0)), 0)
      const avgMargin = carsWithPrices.length > 0 ? totalMargin / carsWithPrices.length : 0

      // Обработка сделок
      const dealsActive = deals.filter(d => ['NEW', 'IN_PROGRESS'].includes(d.status)).length
      const dealsCompleted = deals.filter(d => d.status === 'COMPLETED').length
      const dealsPending = deals.filter(d => d.status === 'PENDING_PAYMENT').length
      const dealsByStatus = [
        { status: 'Новые', count: deals.filter(d => d.status === 'NEW').length },
        { status: 'В работе', count: deals.filter(d => d.status === 'IN_PROGRESS').length },
        { status: 'Ожидают оплату', count: dealsPending },
        { status: 'Оплачены', count: deals.filter(d => d.status === 'PAID').length },
        { status: 'Завершены', count: dealsCompleted },
      ].filter(s => s.count > 0)

      const totalRevenue = deals.reduce((sum, d) => sum + Number(d.paid_amount_usd || 0), 0)
      const totalDebt = deals.reduce((sum, d) => {
        const total = Number(d.total_amount || 0)
        const paid = Number(d.paid_amount_usd || 0)
        return sum + Math.max(0, total - paid)
      }, 0)

      // Обработка склада
      const lowStockItems = stockItems.filter(i => Number(i.quantity) <= Number(i.min_quantity)).length
      const stockValue = stockItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.avg_purchase_price || 0), 0)

      // Обработка HR
      const totalSalaryDebt = employees.reduce((sum, e) => sum + Number(e.salary_balance || 0), 0)

      // Обработка автоплощадки
      const autoDealsActive = autoDeals.filter(d => ['NEW', 'IN_PROGRESS'].includes(d.status)).length
      const autoDealsOverdue = autoDeals.filter(d => d.status === 'OVERDUE').length
      const autoTotalRevenue = autoDeals.reduce((sum, d) => sum + Number(d.total_paid || 0), 0)
      const autoTotalDebt = autoDeals.reduce((sum, d) => sum + Number(d.total_debt || 0), 0)
      const autoCommissionEarned = autoDeals
        .filter(d => d.deal_type === 'COMMISSION_SALE' && d.status === 'COMPLETED')
        .reduce((sum, d) => sum + Number(d.commission_amount || 0), 0)
      
      const autoDealsByType = [
        { type: 'Наличные', count: autoDeals.filter(d => d.deal_type === 'CASH_SALE').length },
        { type: 'Комиссия', count: autoDeals.filter(d => d.deal_type === 'COMMISSION_SALE').length },
        { type: 'Рассрочка', count: autoDeals.filter(d => d.deal_type === 'INSTALLMENT').length },
        { type: 'Аренда', count: autoDeals.filter(d => d.deal_type === 'RENT').length },
      ].filter(t => t.count > 0)

      setData({
        totalBalance,
        balanceByСurrency,
        transactionsCount: transactions.length,
        incomeTotal,
        expenseTotal,
        dailyTransactions,
        carsInStock,
        carsSold,
        carsTotal: cars.length,
        carsByStatus,
        totalMargin,
        avgMargin,
        totalProfit,
        avgProfit,
        profitDealsCount,
        dealsActive,
        dealsCompleted,
        dealsPending,
        dealsTotal: deals.length,
        dealsByStatus,
        totalRevenue,
        totalDebt,
        stockItems: stockItems.length,
        lowStockItems,
        stockValue,
        employeesCount: employees.length,
        totalSalaryDebt,
        autoClientsCount: autoClients.length,
        autoDealsTotal: autoDeals.length,
        autoDealsActive,
        autoDealsOverdue,
        autoTotalRevenue,
        autoTotalDebt,
        autoCommissionEarned,
        autoDealsByType,
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, period, getDateRangeForPeriod])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const formatCurrency = (value: number, currency = 'USD') => {
    const symbols: Record<string, string> = { USD: '$', RUB: '₽', EUR: '€', USDT: '₮' }
    return `${symbols[currency] || ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Аналитика</h1>
                  <p className="text-sm text-muted-foreground">Отчеты и статистика</p>
                </div>
              </div>
            </div>
<div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-9 px-3 bg-transparent border-border">
                      <Calendar className="h-4 w-4 mr-2" />
                      {getPeriodLabel(period)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setPeriod('today')}>
                      {period === 'today' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'today' ? 'ml-6' : ''}>Сегодня</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('this_week')}>
                      {period === 'this_week' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'this_week' ? 'ml-6' : ''}>Эта неделя</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('this_month')}>
                      {period === 'this_month' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'this_month' ? 'ml-6' : ''}>Этот месяц</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('this_year')}>
                      {period === 'this_year' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'this_year' ? 'ml-6' : ''}>Этот год</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={() => setPeriod('yesterday')}>
                      {period === 'yesterday' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'yesterday' ? 'ml-6' : ''}>Вчера</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('last_week')}>
                      {period === 'last_week' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'last_week' ? 'ml-6' : ''}>Прошлая неделя</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('last_month')}>
                      {period === 'last_month' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'last_month' ? 'ml-6' : ''}>Прошлый месяц</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod('last_year')}>
                      {period === 'last_year' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'last_year' ? 'ml-6' : ''}>Прошлый год</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={() => setPeriod('all')}>
                      {period === 'all' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'all' ? 'ml-6' : ''}>Все время</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={() => setIsDatePickerOpen(true)}>
                      {period === 'custom' && <Check className="h-4 w-4 mr-2" />}
                      <span className={period !== 'custom' ? 'ml-6' : ''}>Выбрать даты</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="icon" onClick={loadAnalytics} className="border-border bg-transparent">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Date Picker Dialog */}
              <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Выбрать даты</DialogTitle>
                  </DialogHeader>
                  <CustomCalendar
                    selected={customDateRange}
                    onSelect={(range) => {
                      setCustomDateRange(range)
                      setPeriod('custom')
                    }}
                    onClose={() => setIsDatePickerOpen(false)}
                  />
                </DialogContent>
              </Dialog>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Ключевые метрики */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Link href="/finance">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <DollarSign className="h-4 w-4" />
                  Общий баланс
                </div>
                <p className="text-2xl font-bold font-mono text-foreground mt-1">
                  {formatCurrency(data.totalBalance)}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/deals">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full border-emerald-500/30">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Прибыль
                </div>
                <p className={`text-2xl font-bold font-mono mt-1 ${data.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.totalProfit >= 0 ? '+' : ''}{formatCurrency(data.totalProfit)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.profitDealsCount} сделок, ср. {formatCurrency(data.avgProfit)}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finance">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  Доходы
                </div>
                <p className="text-2xl font-bold font-mono text-blue-400 mt-1">
                  +{formatCurrency(data.incomeTotal, 'RUB')}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finance">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  Расходы
                </div>
                <p className="text-2xl font-bold font-mono text-red-400 mt-1">
                  -{formatCurrency(data.expenseTotal, 'RUB')}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/cars">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Car className="h-4 w-4" />
                  Авто на складе
                </div>
                <p className="text-2xl font-bold font-mono text-foreground mt-1">
                  {data.carsInStock}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/deals">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Briefcase className="h-4 w-4" />
                  Активных сделок
                </div>
                <p className="text-2xl font-bold font-mono text-foreground mt-1">
                  {data.dealsActive}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/stock">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Package className="h-4 w-4" />
                  Низкий запас
                </div>
                <p className={`text-2xl font-bold font-mono mt-1 ${data.lowStockItems > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                  {data.lowStockItems}
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Графики */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Доходы/Расходы по дням */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Link href="/finance" className="hover:underline">
                <CardTitle className="text-foreground cursor-pointer">Движение средств</CardTitle>
              </Link>
              <CardDescription>Доходы и расходы по дням</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dailyTransactions}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      labelStyle={{ color: '#f4f4f5' }}
                    />
                    <Bar dataKey="income" name="Доходы" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Расходы" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Балансы по валютам */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Link href="/finance" className="hover:underline">
                <CardTitle className="text-foreground cursor-pointer">Балансы по валютам</CardTitle>
              </Link>
              <CardDescription>Распределение средств</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.balanceByСurrency}
                      dataKey="amount"
                      nameKey="currency"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ currency, percent }) => `${currency} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#71717a' }}
                    >
                      {data.balanceByСurrency.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      formatter={(value: number) => formatCurrency(value, 'RUB')}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Статусы авто */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Link href="/cars" className="hover:underline">
                <CardTitle className="text-foreground cursor-pointer">Автомобили по статусам</CardTitle>
              </Link>
              <CardDescription>Всего: {data.carsTotal} ТС</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.carsByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ status, count }) => `${status}: ${count}`}
                      labelLine={{ stroke: '#71717a' }}
                    >
                      {data.carsByStatus.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Статусы сделок */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Link href="/deals" className="hover:underline">
                <CardTitle className="text-foreground cursor-pointer">Сделки по статусам</CardTitle>
              </Link>
              <CardDescription>Всего: {data.dealsTotal} сделок</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dealsByStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <YAxis dataKey="status" type="category" tick={{ fill: '#a1a1aa', fontSize: 12 }} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                    />
                    <Bar dataKey="count" name="Количество" fill={COLORS.amber} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/deals">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-amber-400" />
                  Финансы по сделкам
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Чистая прибыль</span>
                  <span className={`font-mono font-bold ${data.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(data.totalProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ср. прибыль на авто</span>
                  <span className="font-mono font-bold text-foreground">{formatCurrency(data.avgProfit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Получено оплат</span>
                  <span className="font-mono font-bold text-blue-400">{formatCurrency(data.totalRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ожидается оплат</span>
                  <span className="font-mono font-bold text-amber-400">{formatCurrency(data.totalDebt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Завершено сделок</span>
                  <span className="font-mono font-bold text-foreground">{data.profitDealsCount}</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/stock">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-400" />
                  Склад
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Позиций</span>
                  <span className="font-mono font-bold text-foreground">{data.stockItems}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Стоимость запасов</span>
                  <span className="font-mono font-bold text-foreground">{formatCurrency(data.stockValue, 'RUB')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Низкий запас</span>
                  <span className={`font-mono font-bold ${data.lowStockItems > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                    {data.lowStockItems} позиций
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/hr">
            <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors h-full">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5 text-violet-400" />
                  HR
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Сотрудников</span>
                  <span className="font-mono font-bold text-foreground">{data.employeesCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Задолженность по ЗП</span>
                  <span className={`font-mono font-bold ${data.totalSalaryDebt > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                    {formatCurrency(data.totalSalaryDebt, 'RUB')}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Автоплощадка */}
        {data.autoDealsTotal > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Автоплощадка</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/cars">
                <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Users className="h-4 w-4" />
                      Клиентов
                    </div>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">
                      {data.autoClientsCount}
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/cars">
                <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Briefcase className="h-4 w-4" />
                      Сделок площадки
                    </div>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">
                      {data.autoDealsTotal}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      активных: {data.autoDealsActive}
                      {data.autoDealsOverdue > 0 && (
                        <span className="text-red-400 ml-2">просрочено: {data.autoDealsOverdue}</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/cars">
                <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      Получено
                    </div>
                    <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                      {formatCurrency(data.autoTotalRevenue, 'RUB')}
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/cars">
                <Card className="bg-card border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <TrendingDown className="h-4 w-4 text-amber-400" />
                      Ожидается
                    </div>
                    <p className={`text-2xl font-bold font-mono mt-1 ${data.autoTotalDebt > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                      {formatCurrency(data.autoTotalDebt, 'RUB')}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {data.autoDealsByType.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">Сделки по типам</CardTitle>
                    <CardDescription>Распределение сделок автоплощадки</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.autoDealsByType}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ type, count }) => `${type}: ${count}`}
                            labelLine={{ stroke: '#71717a' }}
                          >
                            {data.autoDealsByType.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {data.autoCommissionEarned > 0 && (
                  <Card className="bg-card border-border border-emerald-500/30">
                    <CardHeader>
                      <CardTitle className="text-foreground">Комиссионные доходы</CardTitle>
                      <CardDescription>Заработано на комиссионных продажах</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-4xl font-bold font-mono text-emerald-400">
                        {formatCurrency(data.autoCommissionEarned, 'RUB')}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
