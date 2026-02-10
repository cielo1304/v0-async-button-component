'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, RefreshCw, FileText, Eye } from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  module: string
  entity_type: string
  entity_id: string | null
  performed_by: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  create: { label: 'Создание', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  update: { label: 'Обновление', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  delete: { label: 'Удаление', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  update_status: { label: 'Статус', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  link_collateral: { label: 'Привязка залога', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  release_collateral: { label: 'Снятие залога', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
}

const MODULE_MAP: Record<string, string> = {
  finance: 'Финансы',
  exchange: 'Обмен',
  auto: 'Авто',
  contacts: 'Контакты',
  assets: 'Активы',
  deals: 'Сделки',
  settings: 'Настройки',
}

export function AuditLogViewer() {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (moduleFilter !== 'all') query = query.eq('module', moduleFilter)
    if (actionFilter !== 'all') query = query.eq('action', actionFilter)

    const { data, error } = await query
    if (error) {
      console.error('Ошибка загрузки аудит лога:', error)
    }
    setEntries((data || []) as AuditEntry[])
    setLoading(false)
  }, [supabase, moduleFilter, actionFilter])

  useEffect(() => { loadEntries() }, [loadEntries])

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.entity_type.toLowerCase().includes(q) ||
      e.entity_id?.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      e.module.toLowerCase().includes(q) ||
      e.performed_by?.toLowerCase().includes(q)
    )
  })

  // Собираем уникальные модули из данных
  const availableModules = [...new Set(entries.map(e => e.module))].sort()

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Журнал аудита
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadEntries} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фильтры */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск по сущности, модулю..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Модуль" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все модули</SelectItem>
                {availableModules.map(m => (
                  <SelectItem key={m} value={m}>{MODULE_MAP[m] || m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Действие" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все действия</SelectItem>
                {Object.entries(ACTION_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">Найдено: {filtered.length} записей</div>

          {/* Таблица */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Модуль</TableHead>
                <TableHead>Сущность</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Кто</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Нет записей аудита</TableCell></TableRow>
              ) : filtered.map(e => {
                const am = ACTION_MAP[e.action] || { label: e.action, color: 'bg-secondary text-muted-foreground border-border' }
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={am.color}>{am.label}</Badge></TableCell>
                    <TableCell className="text-sm">{MODULE_MAP[e.module] || e.module}</TableCell>
                    <TableCell className="text-sm font-mono">{e.entity_type}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">{e.entity_id || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.performed_by || 'Система'}</TableCell>
                    <TableCell>
                      {(e.old_data || e.new_data) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 bg-transparent" onClick={() => setSelectedEntry(e)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Детали записи */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Детали записи аудита</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Действие: </span>
                  <Badge variant="outline" className={(ACTION_MAP[selectedEntry.action] || { color: '' }).color}>
                    {(ACTION_MAP[selectedEntry.action] || { label: selectedEntry.action }).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Модуль: </span>
                  <span className="text-foreground">{MODULE_MAP[selectedEntry.module] || selectedEntry.module}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Сущность: </span>
                  <span className="font-mono text-foreground">{selectedEntry.entity_type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">ID: </span>
                  <span className="font-mono text-xs text-foreground">{selectedEntry.entity_id || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Кто: </span>
                  <span className="text-foreground">{selectedEntry.performed_by || 'Система'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Дата: </span>
                  <span className="text-foreground">{new Date(selectedEntry.created_at).toLocaleString('ru-RU')}</span>
                </div>
              </div>

              {selectedEntry.old_data && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Было (old_data):</h4>
                  <pre className="bg-secondary/50 p-3 rounded-lg text-xs overflow-x-auto max-h-[200px] overflow-y-auto text-foreground">
                    {JSON.stringify(selectedEntry.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEntry.new_data && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Стало (new_data):</h4>
                  <pre className="bg-secondary/50 p-3 rounded-lg text-xs overflow-x-auto max-h-[200px] overflow-y-auto text-foreground">
                    {JSON.stringify(selectedEntry.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
