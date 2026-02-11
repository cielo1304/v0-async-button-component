'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Loader2,
  Shield,
  DollarSign,
  MapPin,
  Clock,
  Eye,
  Plus,
  Pencil,
  Landmark,
  Package,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { VisibilityToggle } from '@/components/shared/visibility-toggle'
import { AudienceNotes } from '@/components/shared/audience-notes'
import {
  getAssetById,
  getAssetValuations,
  getAssetMoves,
  getAssetCollateralLinks,
  getAssetCollateralChain,
  getAssetSaleEvents,
  getAssetTimeline,
  getAssetLocations,
  getEmployeesList,
  updateAsset,
  addAssetValuation,
  addAssetMove,
} from '@/app/actions/assets'

const ASSET_TYPE_LABELS: Record<string, string> = {
  auto: 'Авто', equipment: 'Оборудование', moto: 'Мото',
  real_estate: 'Недвижимость', crypto: 'Крипто', gold: 'Золото', other: 'Другое',
}
const ASSET_STATUS_LABELS: Record<string, string> = {
  in_stock: 'На складе', company_owned: 'Собственность', pledged: 'В залоге',
  replaced: 'Заменён', released: 'Освобождён', foreclosed: 'Изъят',
  moved_to_cars_stock: 'На автоплощадке', on_sale: 'На продаже', sold: 'Продан', written_off: 'Списан',
}
const ASSET_STATUS_COLORS: Record<string, string> = {
  in_stock: 'bg-emerald-500/20 text-emerald-400', company_owned: 'bg-blue-500/20 text-blue-400',
  pledged: 'bg-amber-500/20 text-amber-400', replaced: 'bg-zinc-500/20 text-zinc-400',
  released: 'bg-cyan-500/20 text-cyan-400', foreclosed: 'bg-red-500/20 text-red-400',
  moved_to_cars_stock: 'bg-violet-500/20 text-violet-400', on_sale: 'bg-orange-500/20 text-orange-400',
  sold: 'bg-zinc-500/20 text-zinc-400', written_off: 'bg-zinc-700/20 text-zinc-500',
}

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [asset, setAsset] = useState<Awaited<ReturnType<typeof getAssetById>> | null>(null)
  const [valuations, setValuations] = useState<Awaited<ReturnType<typeof getAssetValuations>>>([])
  const [moves, setMoves] = useState<Awaited<ReturnType<typeof getAssetMoves>>>([])
  const [collateral, setCollateral] = useState<Awaited<ReturnType<typeof getAssetCollateralLinks>>>([])
  const [collateralChain, setCollateralChain] = useState<Awaited<ReturnType<typeof getAssetCollateralChain>>>([])
  const [saleEvents, setSaleEvents] = useState<Awaited<ReturnType<typeof getAssetSaleEvents>>>([])
  const [timeline, setTimeline] = useState<Awaited<ReturnType<typeof getAssetTimeline>>>([])
  const [locations, setLocations] = useState<Awaited<ReturnType<typeof getAssetLocations>>>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Dialogs
  const [isValuationOpen, setIsValuationOpen] = useState(false)
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Valuation form
  const [valForm, setValForm] = useState({
    valuation_amount: '',
    valuation_currency: 'RUB',
    base_amount: '',
    base_currency: 'USD',
    fx_rate: '',
    source_note: '',
    created_by_employee_id: '',
  })

  // Move form
  const [moveForm, setMoveForm] = useState({
    to_location_id: '',
    moved_by_employee_id: '',
    note: '',
  })

  // Edit status form
  const [newStatus, setNewStatus] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [assetData, vals, mvs, coll, collChain, sales, tl, locs, emps] = await Promise.all([
        getAssetById(id),
        getAssetValuations(id),
        getAssetMoves(id),
        getAssetCollateralLinks(id),
        getAssetCollateralChain(id),
        getAssetSaleEvents(id),
        getAssetTimeline(id),
        getAssetLocations(),
        getEmployeesList(),
      ])
      setAsset(assetData)
      setValuations(vals)
      setMoves(mvs)
      setCollateral(coll)
      setCollateralChain(collChain)
      setSaleEvents(sales)
      setTimeline(tl)
      setLocations(locs)
      setEmployees(emps)
    } catch (error) {
      console.error('Error loading asset:', error)
      toast.error('Ошибка загрузки')
      router.push('/assets')
    } finally {
      setIsLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddValuation = async () => {
    if (!valForm.valuation_amount || !valForm.base_amount) {
      toast.error('Заполните сумму оценки')
      return
    }
    setIsSubmitting(true)
    try {
      await addAssetValuation({
        asset_id: id,
        valuation_amount: Number(valForm.valuation_amount),
        valuation_currency: valForm.valuation_currency,
        base_amount: Number(valForm.base_amount),
        base_currency: valForm.base_currency,
        fx_rate: valForm.fx_rate ? Number(valForm.fx_rate) : null,
        source_note: valForm.source_note || null,
        created_by_employee_id: valForm.created_by_employee_id || null,
      })
      toast.success('Оценка добавлена')
      setIsValuationOpen(false)
      setValForm({ valuation_amount: '', valuation_currency: 'RUB', base_amount: '', base_currency: 'USD', fx_rate: '', source_note: '', created_by_employee_id: '' })
      loadData()
    } catch { toast.error('Ошибка добавления оценки') } finally { setIsSubmitting(false) }
  }

  const handleAddMove = async () => {
    if (!moveForm.to_location_id) {
      toast.error('Выберите место')
      return
    }
    setIsSubmitting(true)
    try {
      const lastMove = moves[0]
      await addAssetMove({
        asset_id: id,
        from_location_id: lastMove?.to_location_id || null,
        to_location_id: moveForm.to_location_id,
        moved_by_employee_id: moveForm.moved_by_employee_id || null,
        note: moveForm.note || null,
      })
      toast.success('Перемещение записано')
      setIsMoveOpen(false)
      setMoveForm({ to_location_id: '', moved_by_employee_id: '', note: '' })
      loadData()
    } catch { toast.error('Ошибка записи перемещения') } finally { setIsSubmitting(false) }
  }

  const handleStatusChange = async () => {
    if (!newStatus) return
    setIsSubmitting(true)
    try {
      await updateAsset(id, { status: newStatus as 'in_stock' })
      toast.success('Статус обновлён')
      setIsEditStatusOpen(false)
      loadData()
    } catch { toast.error('Ошибка обновления статуса') } finally { setIsSubmitting(false) }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Актив не найден</p>
      </div>
    )
  }

  const latestVal = valuations[0]
  const currentLocationMove = moves[0]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/assets')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{asset.title}</h1>
                <Badge className={ASSET_STATUS_COLORS[asset.status] || ''}>
                  {ASSET_STATUS_LABELS[asset.status] || asset.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</span>
                {(asset.owner_contact as { display_name: string } | null)?.display_name && (
                  <span>Владелец: {(asset.owner_contact as { display_name: string }).display_name}</span>
                )}
                {(asset.responsible_employee as { full_name: string } | null)?.full_name && (
                  <span>Ответственный: {(asset.responsible_employee as { full_name: string }).full_name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <VisibilityToggle
                compact
                mode={(asset as any).visibility_mode || 'public'}
                allowedRoleCodes={(asset as any).allowed_role_codes || []}
                onModeChange={async (m) => {
                  await updateAsset(id, { visibility_mode: m })
                  loadData()
                }}
                onRoleCodesChange={async (codes) => {
                  await updateAsset(id, { allowed_role_codes: codes })
                  loadData()
                }}
                onSave={() => toast.success('Видимость сохранена')}
              />
              <Button variant="outline" size="sm" onClick={() => { setNewStatus(asset.status); setIsEditStatusOpen(true) }}>
                <Pencil className="h-3 w-3 mr-1" />
                Статус
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Текущая оценка</div>
              {latestVal ? (
                <div>
                  <div className="text-lg font-bold font-mono">
                    {Number(latestVal.valuation_amount).toLocaleString()} {latestVal.valuation_currency}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Number(latestVal.base_amount).toLocaleString()} {latestVal.base_currency}
                  </div>
                </div>
              ) : <div className="text-lg text-muted-foreground">Нет оценки</div>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Местоположение</div>
              <div className="text-lg font-medium">
                {currentLocationMove
                  ? (currentLocationMove.to_location as { name: string } | null)?.name || 'Неизвестно'
                  : 'Не указано'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Залоги</div>
              <div className="text-lg font-mono font-bold">
                {collateral.filter((c) => c.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground mb-1">Создан</div>
              <div className="text-sm">
                {format(new Date(asset.created_at), 'd MMMM yyyy', { locale: ru })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-1"><Package className="h-4 w-4" />Обзор</TabsTrigger>
            <TabsTrigger value="valuations" className="gap-1"><TrendingUp className="h-4 w-4" />Оценки</TabsTrigger>
            <TabsTrigger value="moves" className="gap-1"><MapPin className="h-4 w-4" />Перемещения</TabsTrigger>
            <TabsTrigger value="collateral" className="gap-1"><Landmark className="h-4 w-4" />Залоги</TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1"><Clock className="h-4 w-4" />История</TabsTrigger>
            <TabsTrigger value="visibility" className="gap-1"><Eye className="h-4 w-4" />Видимость</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Информация</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div><span className="text-muted-foreground">Тип:</span> {ASSET_TYPE_LABELS[asset.asset_type]}</div>
                  <div><span className="text-muted-foreground">Статус:</span> {ASSET_STATUS_LABELS[asset.status]}</div>
                  <div><span className="text-muted-foreground">Владелец:</span> {(asset.owner_contact as { display_name: string } | null)?.display_name || '—'}</div>
                  <div><span className="text-muted-foreground">Ответственный:</span> {(asset.responsible_employee as { full_name: string } | null)?.full_name || '—'}</div>
                  {asset.notes && <div className="col-span-2"><span className="text-muted-foreground">Заметки:</span> {asset.notes}</div>}
                </div>
                {saleEvents.length > 0 && (
                  <div className="mt-6 border-t border-border pt-4">
                    <h3 className="font-medium mb-3">Продажи/реализация</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата</TableHead>
                          <TableHead className="text-right">Сумма</TableHead>
                          <TableHead className="text-right">Base</TableHead>
                          <TableHead>Кто</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saleEvents.map((se) => (
                          <TableRow key={se.id}>
                            <TableCell>{format(new Date(se.sold_at), 'd MMM yyyy', { locale: ru })}</TableCell>
                            <TableCell className="text-right font-mono">{Number(se.sale_amount).toLocaleString()} {se.sale_currency}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{Number(se.base_amount).toLocaleString()} {se.base_currency}</TableCell>
                            <TableCell>{(se.created_by_employee as { full_name: string } | null)?.full_name || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Кто со стороны клиента что знает */}
            <AudienceNotes
              notes={(asset.client_audience_notes || {}) as Record<string, string>}
              onChange={async (updated) => {
                await updateAsset(id, { client_audience_notes: updated })
              }}
              onSave={() => { toast.success('Заметки сохранены'); loadData() }}
            />
          </TabsContent>

          {/* Valuations */}
          <TabsContent value="valuations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Оценки</CardTitle>
                  <CardDescription>История оценок актива</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsValuationOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Оценить
                </Button>
              </CardHeader>
              <CardContent>
                {valuations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет оценок</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead>Курс</TableHead>
                        <TableHead>Источник</TableHead>
                        <TableHead>Кто</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuations.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>{format(new Date(v.created_at), 'd MMM yyyy HH:mm', { locale: ru })}</TableCell>
                          <TableCell className="text-right font-mono font-bold">{Number(v.valuation_amount).toLocaleString()} {v.valuation_currency}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{Number(v.base_amount).toLocaleString()} {v.base_currency}</TableCell>
                          <TableCell className="font-mono">{v.fx_rate || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{v.source_note || '—'}</TableCell>
                          <TableCell>{(v.created_by_employee as { full_name: string } | null)?.full_name || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Moves */}
          <TabsContent value="moves">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Перемещения</CardTitle>
                  <CardDescription>Журнал перемещений актива</CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsMoveOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Переместить
                </Button>
              </CardHeader>
              <CardContent>
                {moves.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет перемещений</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Откуда</TableHead>
                        <TableHead>Куда</TableHead>
                        <TableHead>Кто</TableHead>
                        <TableHead>Примечание</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {moves.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{format(new Date(m.moved_at), 'd MMM yyyy HH:mm', { locale: ru })}</TableCell>
                          <TableCell>{(m.from_location as { name: string } | null)?.name || '—'}</TableCell>
                          <TableCell className="font-medium">{(m.to_location as { name: string } | null)?.name || '—'}</TableCell>
                          <TableCell>{(m.moved_by_employee as { full_name: string } | null)?.full_name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{m.note || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Collateral */}
          <TabsContent value="collateral" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Залоговые связи ({collateral.length})</CardTitle>
                <CardDescription>Связи актива с финансовыми сделками как залог</CardDescription>
              </CardHeader>
              <CardContent>
                {collateral.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет залоговых связей</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сделка</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead>Статус залога</TableHead>
                        <TableHead>Оценка / LTV</TableHead>
                        <TableHead>Период</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collateral.map((cl: any) => {
                        const fd = cl.finance_deal
                        const cd = fd?.core_deal
                        return (
                          <TableRow
                            key={cl.id}
                            className="cursor-pointer hover:bg-accent/50"
                            onClick={() => router.push(`/finance-deals/${cd?.id || cl.finance_deal_id}`)}
                          >
                            <TableCell>
                              <div className="text-sm font-medium">{cd?.title || cl.finance_deal_id.slice(0, 8)}</div>
                              {cd?.status && <Badge variant="outline" className="text-[10px] mt-0.5">{cd.status}</Badge>}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {fd?.principal_amount ? `${Number(fd.principal_amount).toLocaleString()} ${fd.contract_currency}` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                cl.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                cl.status === 'foreclosed' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                                cl.status === 'replaced' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                'bg-muted text-muted-foreground border-border'
                              }>
                                {cl.status === 'active' ? 'Активен' : cl.status === 'released' ? 'Освобождён' : cl.status === 'foreclosed' ? 'Обращён' : cl.status === 'replaced' ? 'Заменён' : cl.status}
                              </Badge>
                              {cl.pledged_units && <span className="text-xs text-muted-foreground ml-2">{cl.pledged_units} ед.</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {cl.valuation_at_pledge != null ? (
                                <div>
                                  <span className="font-mono">{Number(cl.valuation_at_pledge).toLocaleString()}</span>
                                  {cl.ltv_at_pledge != null && (
                                    <span className={`ml-2 font-mono ${Number(cl.ltv_at_pledge) > 80 ? 'text-red-400' : Number(cl.ltv_at_pledge) > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                      LTV {cl.ltv_at_pledge}%
                                    </span>
                                  )}
                                </div>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(cl.started_at), 'd MMM yy', { locale: ru })}
                              {cl.ended_at ? ` → ${format(new Date(cl.ended_at), 'd MMM yy', { locale: ru })}` : ' → ...'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Chain history */}
            {collateralChain.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>История замен</CardTitle>
                  <CardDescription>Цепочка замен залога с участием этого актива</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Старый актив</TableHead>
                        <TableHead></TableHead>
                        <TableHead>Новый актив</TableHead>
                        <TableHead>Причина</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collateralChain.map((ch: any) => (
                        <TableRow key={ch.id}>
                          <TableCell className="text-xs">{format(new Date(ch.created_at), 'd MMM yyyy', { locale: ru })}</TableCell>
                          <TableCell>
                            {ch.old_asset_id === id ? (
                              <span className="text-sm font-medium text-amber-400">Этот актив</span>
                            ) : (
                              <span className="text-sm cursor-pointer hover:underline" onClick={() => router.push(`/assets/${ch.old_asset_id}`)}>
                                {ch.old_asset?.title || ch.old_asset_id.slice(0, 8)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">→</TableCell>
                          <TableCell>
                            {ch.new_asset_id === id ? (
                              <span className="text-sm font-medium text-emerald-400">Этот актив</span>
                            ) : (
                              <span className="text-sm cursor-pointer hover:underline" onClick={() => router.push(`/assets/${ch.new_asset_id}`)}>
                                {ch.new_asset?.title || ch.new_asset_id.slice(0, 8)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{ch.reason || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>История</CardTitle>
                <CardDescription>Все события актива</CardDescription>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет событий</p>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((event, idx) => (
                      <div key={`${event.entity_id}-${idx}`} className="flex gap-4 items-start border-b border-border pb-3 last:border-0">
                        <div className="text-xs text-muted-foreground min-w-[100px] pt-0.5">
                          {format(new Date(event.event_time), 'd MMM yyyy HH:mm', { locale: ru })}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{event.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {event.event_type}
                            {event.amount ? ` / ${Number(event.amount).toLocaleString()} ${event.currency}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visibility */}
          <TabsContent value="visibility">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Видимость
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Режим:</span>{' '}
                    <Badge variant={asset.visibility_mode === 'public' ? 'default' : 'secondary'}>
                      {asset.visibility_mode === 'public' ? 'Публичный' : 'Ограниченный'}
                    </Badge>
                  </div>
                  {asset.allowed_role_codes && asset.allowed_role_codes.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Роли:</span>{' '}
                      {asset.allowed_role_codes.map((code: string) => (
                        <Badge key={code} variant="outline" className="mr-1">{code}</Badge>
                      ))}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Памятка (кто со стороны клиента что знает):</span>
                    <pre className="mt-1 p-3 bg-secondary rounded text-xs overflow-auto">
                      {JSON.stringify(asset.client_audience_notes, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Valuation Dialog */}
      <Dialog open={isValuationOpen} onOpenChange={setIsValuationOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Оценить актив</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Сумма оценки</Label>
                <Input type="number" value={valForm.valuation_amount} onChange={(e) => setValForm({ ...valForm, valuation_amount: e.target.value })} placeholder="1000000" />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={valForm.valuation_currency} onValueChange={(v) => setValForm({ ...valForm, valuation_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RUB">RUB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base сумма</Label>
                <Input type="number" value={valForm.base_amount} onChange={(e) => setValForm({ ...valForm, base_amount: e.target.value })} placeholder="10000" />
              </div>
              <div className="space-y-2">
                <Label>Base валюта</Label>
                <Select value={valForm.base_currency} onValueChange={(v) => setValForm({ ...valForm, base_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="RUB">RUB</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Курс (fx rate)</Label>
              <Input type="number" value={valForm.fx_rate} onChange={(e) => setValForm({ ...valForm, fx_rate: e.target.value })} placeholder="95.5" />
            </div>
            <div className="space-y-2">
              <Label>Источник/примечание</Label>
              <Input value={valForm.source_note} onChange={(e) => setValForm({ ...valForm, source_note: e.target.value })} placeholder="Оценка дилера" />
            </div>
            <div className="space-y-2">
              <Label>Кто оценил</Label>
              <Select value={valForm.created_by_employee_id} onValueChange={(v) => setValForm({ ...valForm, created_by_employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Сотрудник" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (<SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsValuationOpen(false)}>Отмена</Button>
            <Button onClick={handleAddValuation} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Переместить актив</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Куда</Label>
              <Select value={moveForm.to_location_id} onValueChange={(v) => setMoveForm({ ...moveForm, to_location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите место" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Кто перемещает</Label>
              <Select value={moveForm.moved_by_employee_id} onValueChange={(v) => setMoveForm({ ...moveForm, moved_by_employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Сотрудник" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (<SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input value={moveForm.note} onChange={(e) => setMoveForm({ ...moveForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveOpen(false)}>Отмена</Button>
            <Button onClick={handleAddMove} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Переместить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={isEditStatusOpen} onOpenChange={setIsEditStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Изменить статус</DialogTitle></DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditStatusOpen(false)}>Отмена</Button>
            <Button onClick={handleStatusChange} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
