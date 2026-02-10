'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollText, Search, RefreshCw, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface AuditLogEntry {
  id: string
  table_name: string
  record_id: string | null
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_by: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  employee?: { full_name: string } | null
}

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  INSERT: { label: 'Создание', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  UPDATE: { label: 'Изменение', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  DELETE: { label: 'Удаление', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

const TABLE_LABELS: Record<string, string> = {
  core_deals: 'Сделки (core)',
  finance_deals: 'Финансовые сделки',
  finance_ledger: 'Книга операций',
  finance_participants: 'Участники',
  finance_collateral_links: 'Залоги',
  assets: 'Имущество',
  asset_valuations: 'Оценки',
  contacts: 'Контакты',
  employees: 'Сотрудники',
  exchange_rates: 'Курсы обмена',
  client_exchange_operations: 'Операции обмена',
  cashboxes: 'Кассы',
  cashbox_transactions: 'Транзакции касс',
  deals: 'Сделки (legacy)',
  cars: 'Автомобили',
}

export function AuditLogViewer() {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tableFilter, setTableFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const PAGE_SIZE = 50

  // Получаем уникальные таблицы для фильтра
  const [availableTables, setAvailableTables] = useState<string[]>([])

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*, employee:employees(full_name)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter)
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      const { data, error } = await query
      if (error) throw error
      setEntries((data || []) as AuditLogEntry[])
    } catch {
      toast.error('Ошибка загрузки журнала аудита')
    } finally {
      setLoading(false)
    }
  }, [supabase, page, tableFilter, actionFilter])

  const loadTables = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('table_name')
        .limit(1000)

      if (data) {
        const uniqueTables = Array.from(new Set(data.map(d => d.table_name))).sort()
        setAvailableTables(uniqueTables)
      }
    } catch {
      // Таблица может не существовать
    }
  }, [supabase])

  useEffect(() => { loadEntries(); loadTables() }, [loadEntries, loadTables])

  const filtered = useMemo(() => {
    if (!search) return entries
    const q = search.toLowerCase()
    return entries.filter(e =>
      e.table_name.toLowerCase().includes(q) ||
      e.record_id?.toLowerCase().includes(q) ||
      (e.employee as any)?.full_name?.toLowerCase().includes(q)
    )
  }, [entries, search])

  // Форматирование diff
  const renderDiff = (old_data: Record<string, unknown> | null, new_data: Record<string, unknown> | null) => {
    if (!old_data && !new_data) return <p className="text-sm text-muted-foreground">Нет данных</p>

    const allKeys = new Set([
      ...Object.keys(old_data || {}),
      ...Object.keys(new_data || {}),
    ])

    // Исключаем технические поля
    const excluded = ['id', 'created_at', 'updated_at']
    const keys = Array.from(allKeys).filter(k => !excluded.includes(k))

    return (
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {keys.map(key => {
          const oldVal = old_data?.[key]
          const newVal = new_data?.[key]
          const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal)

          if (!changed && old_data && new_data) return null // Не показываем неизменённые

          return (
            <div key={key} className={`text-xs p-1.5 rounded ${changed ? 'bg-amber-500/5 border border-amber-500/20' : ''}`}>
              <span className="text-muted-foreground font-mono">{key}: </span>
              {old_data && oldVal !== undefined && (
                <span className="text-red-400 line-through mr-2">{JSON.stringify(oldVal)}</span>
              )}
              {new_data && newVal !== undefined && (
                <span className="text-emerald-400">{JSON.stringify(newVal)}</span>
              )}
            </div>
          )
        }).filter(Boolean)}
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-amber-400" />
                Журнал аудита
              </CardTitle>
              <CardDescription>Все изменения в системе фиксируются автоматически</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadEntries} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фильтры */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск по таблице, ID, сотруднику..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={tableFilter} onValueChange={v => { setTableFilter(v); setPage(0) }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Таблица" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все таблицы</SelectItem>
                {availableTables.map(t => (
                  <SelectItem key={t} value={t}>{TABLE_LABELS[t] || t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0) }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Действие" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все действия</SelectItem>
                {Object.entries(ACTION_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Таблица */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Время</TableHead>
                <TableHead>Таблица</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Запись</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Нет записей</TableCell></TableRow>
              ) : filtered.map(entry => {
                const act = ACTION_MAP[entry.action] || { label: entry.action, color: '' }
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono">{TABLE_LABELS[entry.table_name] || entry.table_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={act.color}>{act.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">{entry.record_id?.slice(0, 8) || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{(entry.employee as any)?.full_name || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent" onClick={() => setSelectedEntry(entry)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Пагинация */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Страница {page + 1} ({filtered.length} записей)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="bg-transparent">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={entries.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="bg-transparent">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Детали записи */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-sm">{selectedEntry && (TABLE_LABELS[selectedEntry.table_name] || selectedEntry.table_name)}</span>
              {selectedEntry && (
                <Badge variant="outline" className={ACTION_MAP[selectedEntry.action]?.color || ''}>
                  {ACTION_MAP[selectedEntry.action]?.label || selectedEntry.action}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Время: </span>
                  <span>{new Date(selectedEntry.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ID записи: </span>
                  <span className="font-mono text-xs">{selectedEntry.record_id || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Сотрудник: </span>
                  <span>{(selectedEntry.employee as any)?.full_name || '-'}</span>
                </div>
                {selectedEntry.ip_address && (
                  <div>
                    <span className="text-muted-foreground">IP: </span>
                    <span className="font-mono text-xs">{selectedEntry.ip_address}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Изменения</p>
                {renderDiff(selectedEntry.old_data, selectedEntry.new_data)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
