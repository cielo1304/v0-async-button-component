'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Search, Calendar, ArrowDown, ArrowUp, RefreshCw, XCircle, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ClientExchangeOperation, ClientExchangeDetail } from '@/lib/types/database'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, getMonth, getYear } from 'date-fns'
import { ru } from 'date-fns/locale'

const CURRENCY_SYMBOLS: Record<string, string> = {
  'RUB': '₽',
  'USD': '$',
  'EUR': '€',
  'UAH': '₴',
  'TRY': '₺',
  'AED': 'د.إ',
  'CNY': '¥',
  'GBP': '£',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает', color: 'bg-amber-500/20 text-amber-400' },
  completed: { label: 'Выполнен', color: 'bg-emerald-500/20 text-emerald-400' },
  cancelled: { label: 'Отменен', color: 'bg-red-500/20 text-red-400' },
}

type DateFilterType = 'today' | 'this_week' | 'this_month' | 'this_year' | 'yesterday' | 'last_week' | 'last_month' | 'last_year' | 'all' | 'custom'

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

interface ExchangeHistoryListProps {
  refreshKey?: number
}

export function ExchangeHistoryList({ refreshKey = 0 }: ExchangeHistoryListProps) {
  const supabase = useMemo(() => createClient(), [])
  const [operations, setOperations] = useState<ClientExchangeOperation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOperation, setSelectedOperation] = useState<ClientExchangeOperation | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<ClientExchangeDetail[]>([])
  
  // Фильтры
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today')
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  
  // Получение лейбла периода
  const getPeriodLabel = (p: DateFilterType): string => {
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
      default: return 'Сегодня'
    }
  }

  // Получение диапазона дат по периоду
  const getDateRangeForPeriod = useCallback((p: DateFilterType): { start: Date; end: Date } | null => {
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
        return { start: startOfDay(now), end: endOfDay(now) }
    }
  }, [customDateRange])
  
  const loadOperations = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('client_exchange_operations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      
      // Фильтр по статусу
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      
      // Фильтр по дате
      const dateRange = getDateRangeForPeriod(dateFilter)
      if (dateRange) {
        query = query.gte('created_at', dateRange.start.toISOString())
        query = query.lte('created_at', dateRange.end.toISOString())
      }
      
      const { data, error } = await query
      
      if (error) throw error
      setOperations(data || [])
    } catch {
      toast.error('Ошибка загрузки истории')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, statusFilter, dateFilter, getDateRangeForPeriod])
  
  useEffect(() => {
    loadOperations()
  }, [loadOperations, refreshKey])
  
  // Фильтрация по поиску
  const filteredOperations = useMemo(() => {
    if (!searchQuery) return operations
    
    const query = searchQuery.toLowerCase()
    return operations.filter(e => 
      e.client_name?.toLowerCase().includes(query) ||
      e.client_phone?.includes(query) ||
      e.operation_number.toLowerCase().includes(query)
    )
  }, [operations, searchQuery])
  
  // Загрузка деталей операции
  const loadDetails = async (operation: ClientExchangeOperation) => {
    try {
      const { data, error } = await supabase
        .from('client_exchange_details')
        .select('*')
        .eq('operation_id', operation.id)
        .order('direction')
      
      if (error) throw error
      setSelectedDetails(data || [])
      setSelectedOperation(operation)
    } catch {
      toast.error('Ошибка загрузки деталей')
    }
  }
  
  // Отмена операции (только pending)
  const cancelOperation = async (operation: ClientExchangeOperation) => {
    if (operation.status !== 'pending') {
      toast.error('Можно отменить только ожидающие операции')
      return
    }
    
    if (!confirm('Отменить эту операцию?')) return
    
    try {
      const { error } = await supabase
        .from('client_exchange_operations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: 'Отменено оператором'
        })
        .eq('id', operation.id)
      
      if (error) throw error
      toast.success('Операция отменена')
      loadOperations()
    } catch {
      toast.error('Ошибка отмены')
    }
  }
  
  // Группировка деталей по направлению
  const giveDetails = selectedDetails.filter(d => d.direction === 'give')
  const receiveDetails = selectedDetails.filter(d => d.direction === 'receive')
  
  // Форматирование сводки операции (для таблицы)
  const formatOperationSummary = (op: ClientExchangeOperation) => {
    // Пока без деталей - показываем эквивалент в USD
    return `${op.total_client_gives_usd.toFixed(0)} USD`
  }
  
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-cyan-400" />
            История операций
          </CardTitle>
          
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="pending">Ожидает</SelectItem>
                <SelectItem value="completed">Выполнен</SelectItem>
                <SelectItem value="cancelled">Отменен</SelectItem>
              </SelectContent>
            </Select>
            
<DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 px-3 bg-transparent border-border">
                    <Calendar className="h-4 w-4 mr-2" />
                    {getPeriodLabel(dateFilter)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setDateFilter('today')}>
                    {dateFilter === 'today' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'today' ? 'ml-6' : ''}>Сегодня</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('this_week')}>
                    {dateFilter === 'this_week' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'this_week' ? 'ml-6' : ''}>Эта неделя</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('this_month')}>
                    {dateFilter === 'this_month' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'this_month' ? 'ml-6' : ''}>Этот месяц</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('this_year')}>
                    {dateFilter === 'this_year' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'this_year' ? 'ml-6' : ''}>Этот год</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => setDateFilter('yesterday')}>
                    {dateFilter === 'yesterday' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'yesterday' ? 'ml-6' : ''}>Вчера</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('last_week')}>
                    {dateFilter === 'last_week' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'last_week' ? 'ml-6' : ''}>Прошлая неделя</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('last_month')}>
                    {dateFilter === 'last_month' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'last_month' ? 'ml-6' : ''}>Прошлый месяц</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDateFilter('last_year')}>
                    {dateFilter === 'last_year' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'last_year' ? 'ml-6' : ''}>Прошлый год</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => setDateFilter('all')}>
                    {dateFilter === 'all' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'all' ? 'ml-6' : ''}>Все время</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => setIsDatePickerOpen(true)}>
                    {dateFilter === 'custom' && <Check className="h-4 w-4 mr-2" />}
                    <span className={dateFilter !== 'custom' ? 'ml-6' : ''}>Выбрать даты</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button variant="outline" size="icon" onClick={loadOperations} className="bg-transparent">
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        
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
                setDateFilter('custom')
              }}
              onClose={() => setIsDatePickerOpen(false)}
            />
          </DialogContent>
        </Dialog>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead className="text-right">Оборот</TableHead>
              <TableHead className="text-right">Прибыль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOperations.map(op => (
              <TableRow 
                key={op.id} 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => loadDetails(op)}
              >
                <TableCell className="font-mono text-cyan-400">
                  {op.operation_number}
                </TableCell>
                <TableCell className="text-sm">
                  {format(new Date(op.created_at), 'dd.MM.yy HH:mm', { locale: ru })}
                </TableCell>
                <TableCell>
                  {op.client_name || <span className="text-muted-foreground">-</span>}
                  {op.client_phone && (
                    <div className="text-xs text-muted-foreground">{op.client_phone}</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ~{Number(op.total_client_gives_usd).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} USD
                </TableCell>
                <TableCell className="text-right">
                  {Number(op.profit_amount) > 0 ? (
                    <span className="font-mono text-emerald-400">
                      +{Number(op.profit_amount).toFixed(2)} {op.profit_currency}
                    </span>
                  ) : Number(op.profit_amount) < 0 ? (
                    <span className="font-mono text-red-400">
                      {Number(op.profit_amount).toFixed(2)} {op.profit_currency}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_LABELS[op.status]?.color || ''}>
                    {STATUS_LABELS[op.status]?.label || op.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {op.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelOperation(op)
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredOperations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {isLoading ? 'Загрузка...' : 'Нет операций'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {/* Диалог деталей мультивалютной операции */}
        <Dialog open={!!selectedOperation} onOpenChange={() => setSelectedOperation(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl text-cyan-400">{selectedOperation?.operation_number}</span>
                  {selectedOperation && (
                    <Badge className={STATUS_LABELS[selectedOperation.status]?.color || ''}>
                      {STATUS_LABELS[selectedOperation.status]?.label || selectedOperation.status}
                    </Badge>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            {selectedOperation && (
              <div className="space-y-4 pt-2">
                {/* Дата и локация */}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{format(new Date(selectedOperation.created_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}</span>
                  {selectedOperation.location && (
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded">{selectedOperation.location}</span>
                  )}
                </div>
                
                {/* Клиент отдал */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                    <ArrowDown className="h-4 w-4" />
                    Клиент отдал (мы получили)
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
                    {giveDetails.length > 0 ? giveDetails.map(d => (
                      <div key={d.id} className="flex justify-between items-center">
                        <div>
                          <span className="font-medium text-foreground">{d.currency}</span>
                          {d.applied_rate && (
                            <span className="text-xs text-muted-foreground ml-2">
                              @ {d.applied_rate}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-lg text-foreground">
                          {Number(d.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {CURRENCY_SYMBOLS[d.currency] || d.currency}
                        </span>
                      </div>
                    )) : (
                      <div className="text-muted-foreground text-sm">Нет данных</div>
                    )}
                    {giveDetails.length > 0 && (
                      <div className="pt-2 border-t border-emerald-500/20 flex justify-between text-sm">
                        <span className="text-muted-foreground">Эквивалент USD:</span>
                        <span className="font-mono text-emerald-400">
                          ~{Number(selectedOperation.total_client_gives_usd).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} $
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Клиент получил */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                    <ArrowUp className="h-4 w-4" />
                    Клиент получил (мы выдали)
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-2">
                    {receiveDetails.length > 0 ? receiveDetails.map(d => (
                      <div key={d.id} className="flex justify-between items-center">
                        <div>
                          <span className="font-medium text-foreground">{d.currency}</span>
                          {d.applied_rate && (
                            <span className="text-xs text-muted-foreground ml-2">
                              @ {d.applied_rate}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-lg text-foreground">
                          {Number(d.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {CURRENCY_SYMBOLS[d.currency] || d.currency}
                        </span>
                      </div>
                    )) : (
                      <div className="text-muted-foreground text-sm">Нет данных</div>
                    )}
                    {receiveDetails.length > 0 && (
                      <div className="pt-2 border-t border-red-500/20 flex justify-between text-sm">
                        <span className="text-muted-foreground">Эквивалент USD:</span>
                        <span className="font-mono text-red-400">
                          ~{Number(selectedOperation.total_client_receives_usd).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} $
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Прибыль */}
                <div className={`p-4 rounded-lg border ${
                  Number(selectedOperation.profit_amount) >= 0 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Прибыль с операции</div>
                    <div className={`text-2xl font-mono font-bold ${
                      Number(selectedOperation.profit_amount) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {Number(selectedOperation.profit_amount) >= 0 ? '+' : ''}
                      {Number(selectedOperation.profit_amount).toFixed(2)} {selectedOperation.profit_currency}
                    </div>
                  </div>
                </div>
                
                {/* Клиент */}
                {(selectedOperation.client_name || selectedOperation.client_phone || selectedOperation.client_document) && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Данные клиента</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {selectedOperation.client_name && (
                        <div>
                          <span className="text-muted-foreground">ФИО: </span>
                          <span className="text-foreground">{selectedOperation.client_name}</span>
                        </div>
                      )}
                      {selectedOperation.client_phone && (
                        <div>
                          <span className="text-muted-foreground">Тел: </span>
                          <span className="text-foreground">{selectedOperation.client_phone}</span>
                        </div>
                      )}
                      {selectedOperation.client_document && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Документ: </span>
                          <span className="text-foreground">{selectedOperation.client_document}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Заметки */}
                {selectedOperation.client_notes && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Заметки</div>
                    <p className="text-sm text-foreground">{selectedOperation.client_notes}</p>
                  </div>
                )}
                
                {/* Кнопка отмены для pending */}
                {selectedOperation.status === 'pending' && (
                  <div className="pt-3 border-t border-border flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        cancelOperation(selectedOperation)
                        setSelectedOperation(null)
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Отменить операцию
                    </Button>
                  </div>
                )}
                
                {/* Причина отмены */}
                {selectedOperation.status === 'cancelled' && selectedOperation.cancelled_reason && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Причина отмены</div>
                    <p className="text-sm text-red-400">{selectedOperation.cancelled_reason}</p>
                    {selectedOperation.cancelled_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(selectedOperation.cancelled_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
