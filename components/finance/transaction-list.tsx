'use client'

import React from "react"

import { useEffect, useState, useMemo } from 'react'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Transaction, Cashbox } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Filter, X, Calendar, ChevronUp, ChevronDown, Check, Settings2, GripVertical } from 'lucide-react'
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, setMonth, setYear, getMonth, getYear } from 'date-fns'
import { ru } from 'date-fns/locale'
import { TransactionDetailDialog } from './transaction-detail-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const CATEGORY_LABELS: Record<string, string> = {
  DEPOSIT: 'Внесение',
  WITHDRAW: 'Изъятие',
  DEAL_PAYMENT: 'Оплата сделки',
  EXPENSE: 'Расход',
  SALARY: 'Зарплата',
  EXCHANGE_OUT: 'Обмен (списание)',
  EXCHANGE_IN: 'Обмен (зачисление)',
  TRANSFER_OUT: 'Перевод (списание)',
  TRANSFER_IN: 'Перевод (зачисление)',
}

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

interface TransactionWithCashbox extends Transaction {
  cashboxes?: { name: string; currency: string }
}

interface Props {
  cashboxId?: string
  refreshKey?: number
}

type DateRange = {
  from: Date | undefined
  to: Date | undefined
}

// Column definition with visibility and order
interface ColumnConfig {
  key: string
  label: string
  visible: boolean
  draggable: boolean
}

// Default column configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'created_at', label: 'Дата', visible: true, draggable: true },
  { key: 'cashboxes', label: 'Касса', visible: true, draggable: true },
  { key: 'category', label: 'Категория', visible: true, draggable: true },
  { key: 'income', label: 'Приход', visible: true, draggable: true },
  { key: 'expense', label: 'Расход', visible: true, draggable: true },
  { key: 'balance_after', label: 'Остаток', visible: true, draggable: true },
  { key: 'comment', label: 'Комментарий', visible: true, draggable: true },
]

// Custom Calendar Component
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
      {/* Header: Month dropdown + Year spinner */}
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
          {/* Month Dropdown */}
          <DropdownMenu open={monthDropdownOpen} onOpenChange={setMonthDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 font-medium">
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
          
          {/* Year Spinner */}
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
      
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_RU.map(day => (
          <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Previous month days */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`prev-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {prevMonthDays - startOffset + i + 1}
          </div>
        ))}
        
        {/* Current month days */}
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
        
        {/* Next month days */}
        {Array.from({ length: 42 - startOffset - daysInMonth }).map((_, i) => (
          <div key={`next-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {i + 1}
          </div>
        ))}
      </div>
      
      {/* Footer */}
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

export function TransactionList({ cashboxId, refreshKey }: Props) {
  const [transactions, setTransactions] = useState<TransactionWithCashbox[]>([])
  const [cashboxes, setCashboxes] = useState<{ id: string; name: string; currency: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithCashbox | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  
  // Column configuration state
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false)
  
  // Фильтры - по умолчанию "Сегодня"
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [cashboxFilter, setCashboxFilter] = useState<string>(cashboxId || 'all')
  const [periodFilter, setPeriodFilter] = useState<string>('today')
  
  // Sync cashboxFilter when cashboxId prop changes
  useEffect(() => {
    setCashboxFilter(cashboxId || 'all')
  }, [cashboxId])
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  
  const supabase = useMemo(() => createClient(), [])

  // Toggle column visibility
  const toggleColumnVisibility = (key: string) => {
    setColumnConfig(prev => prev.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    ))
  }

  // Handle column drag start
  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedColumn(key)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Handle column drag over
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault()
    if (!draggedColumn || draggedColumn === key) return
    
    setColumnConfig(prev => {
      const newConfig = [...prev]
      const draggedIdx = newConfig.findIndex(c => c.key === draggedColumn)
      const targetIdx = newConfig.findIndex(c => c.key === key)
      
      if (draggedIdx !== -1 && targetIdx !== -1) {
        const [dragged] = newConfig.splice(draggedIdx, 1)
        newConfig.splice(targetIdx, 0, dragged)
      }
      
      return newConfig
    })
  }

  // Handle column drag end
  const handleDragEnd = () => {
    setDraggedColumn(null)
  }

  // Получаем диапазон дат на основе выбранного периода
  const getDateRange = (period: string): { start: Date; end: Date } | null => {
    const now = new Date()
    
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) }
      case 'this_week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) }
      case 'this_year':
        return { start: startOfYear(now), end: endOfYear(now) }
      case 'yesterday':
        const yesterday = subDays(now, 1)
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
      case 'last_week':
        const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
        const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
        return { start: lastWeekStart, end: lastWeekEnd }
      case 'last_month':
        const lastMonthStart = startOfMonth(subMonths(now, 1))
        const lastMonthEnd = endOfMonth(subMonths(now, 1))
        return { start: lastMonthStart, end: lastMonthEnd }
      case 'last_year':
        const lastYearStart = startOfYear(subYears(now, 1))
        const lastYearEnd = endOfYear(subYears(now, 1))
        return { start: lastYearStart, end: lastYearEnd }
      case 'custom':
        if (customDateRange.from && customDateRange.to) {
          return { start: startOfDay(customDateRange.from), end: endOfDay(customDateRange.to) }
        }
        return null
      case 'all':
      default:
        return null
    }
  }

  const getPeriodLabel = (period: string): string => {
    switch (period) {
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
      default: return 'Период'
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        let query = supabase
          .from('transactions')
          .select(`
            *,
            cashboxes (name, currency)
          `)
          .order('created_at', { ascending: false })
          .limit(500)
        
        if (cashboxId) {
          query = query.eq('cashbox_id', cashboxId)
        }
        
        const { data: txData, error: txError } = await query

        if (txError) throw txError
        setTransactions(txData || [])
        
        const { data: cashboxData, error: cashboxError } = await supabase
          .from('cashboxes')
          .select('id, name, currency')
          .eq('is_archived', false)
          .order('name')
          
        if (cashboxError) throw cashboxError
        setCashboxes(cashboxData || [])
      } catch (error) {
        console.error('Error loading transactions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [cashboxId, refreshKey, supabase])

  // Фильтрация транзакций
  const filteredTransactions = useMemo(() => {
    let result = [...transactions]
    
    if (categoryFilter !== 'all') {
      result = result.filter(tx => tx.category === categoryFilter)
    }
    
    // Only filter by cashboxFilter if cashboxId prop is not provided
    // (when cashboxId is provided, SQL query already filters by it)
    if (!cashboxId && cashboxFilter !== 'all') {
      result = result.filter(tx => tx.cashbox_id === cashboxFilter)
    }
    
    const dateRange = getDateRange(periodFilter)
    if (dateRange) {
      result = result.filter(tx => {
        const txDate = new Date(tx.created_at)
        return txDate >= dateRange.start && txDate <= dateRange.end
      })
    }
    
    return result
  }, [transactions, categoryFilter, cashboxFilter, periodFilter, customDateRange])

  const hasActiveFilters = categoryFilter !== 'all' || (cashboxFilter !== 'all' && !cashboxId) || periodFilter !== 'today'

  const clearFilters = () => {
    setCategoryFilter('all')
    if (!cashboxId) setCashboxFilter('all')
    setPeriodFilter('today')
    setCustomDateRange({ from: undefined, to: undefined })
  }

  const handleDateRangeSelect = (range: DateRange) => {
    setCustomDateRange(range)
    setPeriodFilter('custom')
  }

  // Get currency symbol for the selected cashbox
  const getCurrencySymbol = () => {
    if (cashboxId) {
      const box = cashboxes.find(b => b.id === cashboxId)
      return box?.currency === 'RUB' ? '₽' : box?.currency === 'USD' ? '$' : box?.currency === 'EUR' ? '€' : ''
    }
    return '₽'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Build columns based on configuration
  const buildColumns = () => {
    const currencySymbol = getCurrencySymbol()
    
    const columnDefinitions: Record<string, {
      header: React.ReactNode
      cell: (row: TransactionWithCashbox) => React.ReactNode
      className?: string
    }> = {
      created_at: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'created_at')}
            onDragOver={(e) => handleDragOver(e, 'created_at')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Дата
          </div>
        ),
        cell: (row: TransactionWithCashbox) => (
          <div className="text-sm">
            {format(new Date(row.created_at), 'dd MMM yyyy', { locale: ru })}
            <div className="text-xs text-muted-foreground">
              {format(new Date(row.created_at), 'HH:mm', { locale: ru })}
            </div>
          </div>
        ),
      },
      cashboxes: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'cashboxes')}
            onDragOver={(e) => handleDragOver(e, 'cashboxes')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Касса
          </div>
        ),
        cell: (row: TransactionWithCashbox) => (
          <div>
            <div className="font-medium">{row.cashboxes?.name || '-'}</div>
            <div className="text-xs text-muted-foreground">{row.cashboxes?.currency}</div>
          </div>
        ),
      },
      category: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'category')}
            onDragOver={(e) => handleDragOver(e, 'category')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Категория
          </div>
        ),
        cell: (row: TransactionWithCashbox) => (
          <Badge variant="secondary" className="font-normal">
            {CATEGORY_LABELS[row.category] || row.category}
          </Badge>
        ),
      },
      income: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'income')}
            onDragOver={(e) => handleDragOver(e, 'income')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1 justify-end"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Приход
          </div>
        ),
        className: 'text-right font-mono',
        cell: (row: TransactionWithCashbox) => {
          const amount = Number(row.amount)
          if (amount <= 0) return <div className="text-right text-muted-foreground">—</div>
          return (
            <div className="text-right font-semibold text-emerald-500">
              +{amount.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          )
        },
      },
      expense: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'expense')}
            onDragOver={(e) => handleDragOver(e, 'expense')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1 justify-end"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Расход
          </div>
        ),
        className: 'text-right font-mono',
        cell: (row: TransactionWithCashbox) => {
          const amount = Number(row.amount)
          if (amount >= 0) return <div className="text-right text-muted-foreground">—</div>
          return (
            <div className="text-right font-semibold text-red-500">
              {amount.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          )
        },
      },
      balance_after: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'balance_after')}
            onDragOver={(e) => handleDragOver(e, 'balance_after')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1 justify-end"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Остаток
          </div>
        ),
        className: 'text-right font-mono',
        cell: (row: TransactionWithCashbox) => (
          <div className="text-sm text-muted-foreground text-right">
            {Number(row.balance_after).toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        ),
      },
      comment: {
        header: (
          <div 
            draggable
            onDragStart={(e) => handleDragStart(e, 'comment')}
            onDragOver={(e) => handleDragOver(e, 'comment')}
            onDragEnd={handleDragEnd}
            className="cursor-grab select-none flex items-center gap-1"
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            Комментарий
          </div>
        ),
        cell: (row: TransactionWithCashbox) => (
          <div className="text-sm text-muted-foreground max-w-xs truncate">
            {row.description || '—'}
          </div>
        ),
      },
    }

    return columnConfig
      .filter(col => col.visible)
      .map(col => ({
        key: col.key,
        header: columnDefinitions[col.key]?.header || col.label,
        cell: columnDefinitions[col.key]?.cell,
        className: columnDefinitions[col.key]?.className,
      }))
  }

  const columns = buildColumns()

  // Создаем объект cashbox для диалога
  const getCashboxForTransaction = (tx: TransactionWithCashbox): Cashbox | null => {
    if (!tx.cashboxes) return null
    return {
      id: tx.cashbox_id,
      name: tx.cashboxes.name,
      currency: tx.cashboxes.currency,
      type: 'CASH',
      balance: 0,
      initial_balance: 0,
      is_archived: false,
      created_at: '',
      updated_at: '',
    } as Cashbox
  }

  return (
    <>
      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Фильтры:
        </div>
        
        {/* Фильтр по категории */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Фильтр по кассе */}
        {!cashboxId && (
          <Select value={cashboxFilter} onValueChange={setCashboxFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Все кассы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кассы</SelectItem>
              {cashboxes.map((box) => (
                <SelectItem key={box.id} value={box.id}>
                  {box.name} ({box.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {/* Фильтр по периоду */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 px-3 bg-transparent border-border">
              <Calendar className="h-4 w-4 mr-2" />
              {getPeriodLabel(periodFilter)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setPeriodFilter('today')}>
              {periodFilter === 'today' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'today' ? 'ml-6' : ''}>Сегодня</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('this_week')}>
              {periodFilter === 'this_week' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'this_week' ? 'ml-6' : ''}>Эта неделя</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('this_month')}>
              {periodFilter === 'this_month' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'this_month' ? 'ml-6' : ''}>Этот месяц</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('this_year')}>
              {periodFilter === 'this_year' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'this_year' ? 'ml-6' : ''}>Этот год</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => setPeriodFilter('yesterday')}>
              {periodFilter === 'yesterday' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'yesterday' ? 'ml-6' : ''}>Вчера</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('last_week')}>
              {periodFilter === 'last_week' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'last_week' ? 'ml-6' : ''}>Прошлая неделя</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('last_month')}>
              {periodFilter === 'last_month' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'last_month' ? 'ml-6' : ''}>Прошлый месяц</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPeriodFilter('last_year')}>
              {periodFilter === 'last_year' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'last_year' ? 'ml-6' : ''}>Прошлый год</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => setPeriodFilter('all')}>
              {periodFilter === 'all' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'all' ? 'ml-6' : ''}>Все время</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => setIsDatePickerOpen(true)}>
              {periodFilter === 'custom' && <Check className="h-4 w-4 mr-2" />}
              <span className={periodFilter !== 'custom' ? 'ml-6' : ''}>Выбрать даты</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Кнопка сброса фильтров */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Сбросить
          </Button>
        )}
        
        {/* Счетчик результатов и настройка столбцов */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="text-sm text-muted-foreground">
            Показано: {filteredTransactions.length} из {transactions.length}
          </div>
          
          {/* Column Settings Dropdown */}
          <Popover open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <div className="space-y-2">
                {columnConfig.map(col => (
                  <label 
                    key={col.key} 
                    className="flex items-center gap-2 cursor-pointer hover:bg-secondary/50 rounded px-2 py-1.5"
                  >
                    <Checkbox
                      checked={col.visible}
                      onCheckedChange={() => toggleColumnVisibility(col.key)}
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Date Picker Dialog */}
      <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Выбрать даты</DialogTitle>
          </DialogHeader>
          <CustomCalendar
            selected={customDateRange}
            onSelect={handleDateRangeSelect}
            onClose={() => setIsDatePickerOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <DataTable
        data={filteredTransactions}
        columns={columns}
        emptyMessage={hasActiveFilters ? "Нет транзакций по выбранным фильтрам" : "Транзакций пока нет"}
        onRowClick={(tx) => {
          setSelectedTransaction(tx)
          setShowDetail(true)
        }}
      />

      {selectedTransaction && getCashboxForTransaction(selectedTransaction) && (
        <TransactionDetailDialog
          transaction={selectedTransaction}
          cashbox={getCashboxForTransaction(selectedTransaction)!}
          open={showDetail}
          onOpenChange={setShowDetail}
        />
      )}
    </>
  )
}
