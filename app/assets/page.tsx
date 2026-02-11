'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Search,
  Shield,
  Package,
  Landmark,
} from 'lucide-react'
import { toast } from 'sonner'
import { getAssets, createAsset, getEmployeesList, getContactsList } from '@/app/actions/assets'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Textarea } from '@/components/ui/textarea'
import { canViewByVisibility } from '@/lib/access'
import { VisibilityBadge } from '@/components/shared/visibility-toggle'

const ASSET_TYPE_LABELS: Record<string, string> = {
  auto: 'Авто',
  equipment: 'Оборудование',
  moto: 'Мото',
  real_estate: 'Недвижимость',
  crypto: 'Крипто',
  gold: 'Золото',
  other: 'Другое',
}

const ASSET_STATUS_LABELS: Record<string, string> = {
  in_stock: 'На складе',
  company_owned: 'Собственность',
  pledged: 'В залоге',
  replaced: 'Заменён',
  released: 'Освобождён',
  foreclosed: 'Изъят',
  moved_to_cars_stock: 'На автоплощадке',
  on_sale: 'На продаже',
  sold: 'Продан',
  written_off: 'Списан',
}

const ASSET_STATUS_COLORS: Record<string, string> = {
  in_stock: 'bg-emerald-500/20 text-emerald-400',
  company_owned: 'bg-blue-500/20 text-blue-400',
  pledged: 'bg-amber-500/20 text-amber-400',
  replaced: 'bg-zinc-500/20 text-zinc-400',
  released: 'bg-cyan-500/20 text-cyan-400',
  foreclosed: 'bg-red-500/20 text-red-400',
  moved_to_cars_stock: 'bg-violet-500/20 text-violet-400',
  on_sale: 'bg-orange-500/20 text-orange-400',
  sold: 'bg-zinc-500/20 text-zinc-400',
  written_off: 'bg-zinc-700/20 text-zinc-500',
}

type AssetRow = Awaited<ReturnType<typeof getAssets>>[number]

export default function AssetsPage() {
  const router = useRouter()
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [typeFilter, setTypeFilter] = useState('auto') // Updated default value
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Create form
  const [form, setForm] = useState({
    asset_type: 'auto' as string,
    title: '',
    status: 'in_stock' as string,
    owner_contact_id: '',
    responsible_employee_id: '',
    notes: '',
  })
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [contacts, setContacts] = useState<{ id: string; display_name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getAssets({ showAll, assetType: typeFilter, search: searchQuery })
      setAssets(data)
    } catch (error) {
      console.error('Error loading assets:', error)
      toast.error('Ошибка загрузки имущества')
    } finally {
      setIsLoading(false)
    }
  }, [showAll, typeFilter, searchQuery])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreate = async () => {
    try {
      const [emps, conts] = await Promise.all([getEmployeesList(), getContactsList()])
      setEmployees(emps)
      setContacts(conts)
    } catch { /* ignore */ }
    setIsCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error('Введите название')
      return
    }
    setIsSubmitting(true)
    try {
      await createAsset({
        asset_type: form.asset_type as 'auto',
        title: form.title,
        status: form.status as 'in_stock',
        owner_contact_id: form.owner_contact_id || null,
        responsible_employee_id: form.responsible_employee_id || null,
        notes: form.notes || null,
      })
      toast.success('Имущество создано')
      setIsCreateOpen(false)
      setForm({ asset_type: 'auto', title: '', status: 'in_stock', owner_contact_id: '', responsible_employee_id: '', notes: '' })
      loadData()
    } catch (error) {
      toast.error('Ошибка создания')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10">
                  <Shield className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Имущество</h1>
                  <p className="text-sm text-muted-foreground">Активы, залоги, оценки</p>
                </div>
              </div>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Тип имущества" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch checked={showAll} onCheckedChange={setShowAll} id="showAll" />
                <Label htmlFor="showAll" className="text-sm text-muted-foreground cursor-pointer">
                  Показать все
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Список имущества</CardTitle>
            <CardDescription>
              {showAll ? 'Все активы' : 'Активные залоги и имущество на продаже'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : assets.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">Нет имущества</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Владелец</TableHead>
                    <TableHead>Ответственный</TableHead>
                    <TableHead>Место</TableHead>
                    <TableHead className="text-right">Оценка</TableHead>
                    <TableHead>Финсделка</TableHead>
                    <TableHead>Обновлён</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
              {assets.filter(a => canViewByVisibility([], a as any)).map((asset) => (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => router.push(`/assets/${asset.id}`)}
                >
                  <TableCell>
                    <Badge variant="outline">
                      {ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{asset.title}</span>
                      <VisibilityBadge mode={(asset as any).visibility_mode} count={(asset as any).allowed_role_codes?.length} />
                    </div>
                  </TableCell>
                      <TableCell>
                        <Badge className={ASSET_STATUS_COLORS[asset.status] || ''}>
                          {ASSET_STATUS_LABELS[asset.status] || asset.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(asset.owner_contact as { display_name: string } | null)?.display_name || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(asset.responsible_employee as { full_name: string } | null)?.full_name || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {asset.current_location_name || '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {asset.latest_valuation ? (
                          <span>
                            {Number(asset.latest_valuation.valuation_amount).toLocaleString()}{' '}
                            {asset.latest_valuation.valuation_currency}
                            <span className="text-muted-foreground text-xs block">
                              ({Number(asset.latest_valuation.base_amount).toLocaleString()} {asset.latest_valuation.base_currency})
                            </span>
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {asset.linked_finance_deal_id ? (
                          <Badge variant="secondary" className="bg-amber-500/10 text-amber-400">
                            <Landmark className="h-3 w-3 mr-1" />
                            Залог
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(asset.updated_at), 'd MMM yyyy', { locale: ru })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create Asset Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить имущество</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Toyota Land Cruiser 200, серый"
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Владелец (контакт)</Label>
              <Select value={form.owner_contact_id || 'none'} onValueChange={(v) => setForm({ ...form, owner_contact_id: v === 'none' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите контакт" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указан</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ответственный</Label>
              <Select value={form.responsible_employee_id || '__none__'} onValueChange={(v) => setForm({ ...form, responsible_employee_id: v === '__none__' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не указан</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Дополнительная информация..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
