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
import { History, Search, Calendar, ArrowDown, ArrowUp, RefreshCw, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ClientExchangeOperation, ClientExchangeDetail } from '@/lib/types/database'
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
  const [dateFilter, setDateFilter] = useState<string>('today')
  
  const loadOperations = async () => {
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
      setOperations(data || [])
    } catch {
      toast.error('Ошибка загрузки истории')
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadOperations()
  }, [statusFilter, dateFilter, refreshKey])
  
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
            
            <Button variant="outline" size="icon" onClick={loadOperations} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
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
