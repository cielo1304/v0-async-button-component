'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { History, Search, Calendar, ArrowRight, RefreshCw, Eye, XCircle, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ClientExchange } from '@/lib/types/database'
import { format } from 'date-fns'
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

export function ExchangeHistoryList() {
  const supabase = useMemo(() => createClient(), [])
  const [exchanges, setExchanges] = useState<ClientExchange[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedExchange, setSelectedExchange] = useState<ClientExchange | null>(null)
  
  // Фильтры
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('today')
  
  const loadExchanges = async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('client_exchanges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      
      // Фильтр по статусу
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      
      // Фильтр по дате
      const now = new Date()
      if (dateFilter === 'today') {
        const startOfDay = new Date(now)
        startOfDay.setHours(0, 0, 0, 0)
        query = query.gte('created_at', startOfDay.toISOString())
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        query = query.gte('created_at', weekAgo.toISOString())
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        query = query.gte('created_at', monthAgo.toISOString())
      }
      
      const { data, error } = await query
      
      if (error) throw error
      setExchanges(data || [])
    } catch {
      toast.error('Ошибка загрузки истории')
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadExchanges()
  }, [statusFilter, dateFilter])
  
  // Фильтрация по поиску
  const filteredExchanges = useMemo(() => {
    if (!searchQuery) return exchanges
    
    const query = searchQuery.toLowerCase()
    return exchanges.filter(e => 
      e.client_name?.toLowerCase().includes(query) ||
      e.client_phone?.includes(query) ||
      e.operation_number.toString().includes(query) ||
      e.from_currency.toLowerCase().includes(query) ||
      e.to_currency.toLowerCase().includes(query)
    )
  }, [exchanges, searchQuery])
  
  // Отмена операции
  const cancelExchange = async (exchange: ClientExchange) => {
    if (exchange.status !== 'pending') {
      toast.error('Можно отменить только ожидающие операции')
      return
    }
    
    if (!confirm('Отменить эту операцию?')) return
    
    try {
      const { error } = await supabase
        .from('client_exchanges')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: 'Отменено оператором'
        })
        .eq('id', exchange.id)
      
      if (error) throw error
      toast.success('Операция отменена')
      loadExchanges()
    } catch {
      toast.error('Ошибка отмены')
    }
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
            
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Сегодня</SelectItem>
                <SelectItem value="week">Неделя</SelectItem>
                <SelectItem value="month">Месяц</SelectItem>
                <SelectItem value="all">Все время</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="icon" onClick={loadExchanges} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Операция</TableHead>
              <TableHead className="text-right">Отдал</TableHead>
              <TableHead className="text-right">Получил</TableHead>
              <TableHead className="text-right">Курс</TableHead>
              <TableHead className="text-right">Прибыль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExchanges.map(exchange => (
              <TableRow key={exchange.id}>
                <TableCell className="font-mono text-muted-foreground">
                  #{exchange.operation_number}
                </TableCell>
                <TableCell className="text-sm">
                  {format(new Date(exchange.created_at), 'dd.MM.yy HH:mm', { locale: ru })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{exchange.from_currency}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{exchange.to_currency}</span>
                  </div>
                  {exchange.client_name && (
                    <div className="text-xs text-muted-foreground">{exchange.client_name}</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {exchange.from_amount.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[exchange.from_currency] || exchange.from_currency}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {exchange.to_amount.toLocaleString('ru-RU')} {CURRENCY_SYMBOLS[exchange.to_currency] || exchange.to_currency}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {exchange.applied_rate.toFixed(4)}
                </TableCell>
                <TableCell className="text-right">
                  {exchange.profit_amount > 0 ? (
                    <span className="font-mono text-emerald-400">
                      +{exchange.profit_amount.toFixed(2)} {CURRENCY_SYMBOLS[exchange.profit_currency] || exchange.profit_currency}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_LABELS[exchange.status]?.color || ''}>
                    {STATUS_LABELS[exchange.status]?.label || exchange.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedExchange(exchange)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {exchange.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelExchange(exchange)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredExchanges.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {isLoading ? 'Загрузка...' : 'Нет операций'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {/* Диалог деталей */}
        <Dialog open={!!selectedExchange} onOpenChange={() => setSelectedExchange(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Операция #{selectedExchange?.operation_number}
              </DialogTitle>
            </DialogHeader>
            {selectedExchange && (
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Клиент отдал</div>
                    <div className="text-xl font-mono font-bold">
                      {selectedExchange.from_amount.toLocaleString('ru-RU')} {selectedExchange.from_currency}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Клиент получил</div>
                    <div className="text-xl font-mono font-bold">
                      {selectedExchange.to_amount.toLocaleString('ru-RU')} {selectedExchange.to_currency}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Курс</div>
                    <div className="font-mono">{selectedExchange.applied_rate.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Рыночный курс</div>
                    <div className="font-mono">{selectedExchange.market_rate?.toFixed(4) || '-'}</div>
                  </div>
                </div>
                
                {selectedExchange.profit_amount > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-sm text-muted-foreground">Прибыль</div>
                    <div className="text-lg font-mono font-bold text-emerald-400">
                      +{selectedExchange.profit_amount.toFixed(2)} {selectedExchange.profit_currency}
                    </div>
                  </div>
                )}
                
                {selectedExchange.client_name && (
                  <div className="pt-2 border-t border-border">
                    <div className="text-sm text-muted-foreground mb-1">Клиент</div>
                    <div>{selectedExchange.client_name}</div>
                    {selectedExchange.client_phone && (
                      <div className="text-sm text-muted-foreground">{selectedExchange.client_phone}</div>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-2 text-sm">
                  <div className="text-muted-foreground">
                    {format(new Date(selectedExchange.created_at), 'dd MMMM yyyy, HH:mm', { locale: ru })}
                  </div>
                  <Badge className={STATUS_LABELS[selectedExchange.status]?.color || ''}>
                    {STATUS_LABELS[selectedExchange.status]?.label || selectedExchange.status}
                  </Badge>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
