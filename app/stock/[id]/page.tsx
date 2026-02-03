'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { StockItem, StockBatch, StockMovement } from '@/lib/types/database'
import { 
  Package, ArrowLeft, Loader2, AlertTriangle, TrendingUp, TrendingDown, 
  Plus, Minus, RefreshCw, Archive
} from 'lucide-react'
import { StockOperationDialog } from '@/components/stock/stock-operation-dialog'
import { MovementDetailDialog } from '@/components/stock/movement-detail-dialog'

type StockItemWithDetails = StockItem & {
  batches: StockBatch[]
  movements: StockMovement[]
}

const MOVEMENT_TYPE_LABELS: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  PURCHASE: { label: 'Закупка', icon: TrendingUp, color: 'text-emerald-400' },
  SALE: { label: 'Продажа', icon: TrendingDown, color: 'text-blue-400' },
  WRITE_OFF: { label: 'Списание', icon: Minus, color: 'text-red-400' },
  ADJUSTMENT: { label: 'Корректировка', icon: RefreshCw, color: 'text-amber-400' },
  TRANSFER: { label: 'Перемещение', icon: Archive, color: 'text-violet-400' },
}

export default function StockItemPage() {
  const params = useParams()
  const router = useRouter()
  const [item, setItem] = useState<StockItemWithDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null)
  const [showMovementDetail, setShowMovementDetail] = useState(false)
  const supabase = createClient()

  const loadItem = async () => {
    try {
      const { data: itemData, error: itemError } = await supabase
        .from('stock_items')
        .select('*')
        .eq('id', params.id)
        .single()

      if (itemError) throw itemError

      const { data: batchesData } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', params.id)
        .order('batch_date', { ascending: true })

      const { data: movementsData } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('item_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setItem({
        ...itemData,
        batches: batchesData || [],
        movements: movementsData || [],
      })
    } catch (error) {
      console.error('[v0] Error loading stock item:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadItem()
  }, [params.id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Товар не найден</p>
        <Link href="/stock">
          <Button variant="outline">Вернуться к списку</Button>
        </Link>
      </div>
    )
  }

  const isLowStock = item.quantity <= item.min_quantity
  const totalValue = Number(item.avg_purchase_price) * item.quantity
  const activeBatches = item.batches.filter(b => b.remaining_quantity > 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/stock">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{item.name}</h1>
                  <p className="text-sm text-muted-foreground font-mono">{item.sku || 'Без артикула'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StockOperationDialog 
                type="PURCHASE" 
                item={item} 
                onSuccess={loadItem}
              />
              <StockOperationDialog 
                type="WRITE_OFF" 
                item={item} 
                onSuccess={loadItem}
              />
              <StockOperationDialog 
                type="ADJUSTMENT" 
                item={item} 
                onSuccess={loadItem}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Основная информация */}
          <div className="lg:col-span-2 space-y-6">
            {/* Статистика */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Остаток</div>
                  <div className={`text-2xl font-bold font-mono ${isLowStock ? 'text-amber-400' : 'text-foreground'}`}>
                    {item.quantity} {item.unit}
                    {isLowStock && <AlertTriangle className="inline-block ml-2 h-5 w-5" />}
                  </div>
                  {isLowStock && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Минимум: {item.min_quantity} {item.unit}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Средняя цена</div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {Number(item.avg_purchase_price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.currency}</div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Цена продажи</div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {item.sale_price 
                      ? Number(item.sale_price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
                      : '-'
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">{item.currency}</div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Общая стоимость</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {totalValue.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.currency}</div>
                </CardContent>
              </Card>
            </div>

            {/* История движений */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">История движений</CardTitle>
                <CardDescription>Последние операции с товаром</CardDescription>
              </CardHeader>
              <CardContent>
                {item.movements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Нет записей о движениях
                  </div>
                ) : (
                  <div className="space-y-3">
                    {item.movements.map((movement) => {
                      const config = MOVEMENT_TYPE_LABELS[movement.movement_type] || {
                        label: movement.movement_type,
                        icon: RefreshCw,
                        color: 'text-muted-foreground',
                      }
                      const Icon = config.icon
                      const isPositive = ['PURCHASE', 'ADJUSTMENT'].includes(movement.movement_type) && movement.quantity > 0

                      return (
                        <div
                          key={movement.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:bg-secondary transition-colors"
                          onClick={() => {
                            setSelectedMovement(movement)
                            setShowMovementDetail(true)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-secondary ${config.color}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{config.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(movement.created_at).toLocaleString('ru-RU')}
                              </div>
                              {movement.notes && (
                                <div className="text-xs text-muted-foreground mt-1">{movement.notes}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? '+' : ''}{movement.quantity} {item.unit}
                            </div>
                            {movement.unit_price && (
                              <div className="text-xs text-muted-foreground font-mono">
                                @ {Number(movement.unit_price).toLocaleString('ru-RU')} {item.currency}
                              </div>
                            )}
                            {movement.total_price && (
                              <div className="text-xs font-mono text-muted-foreground">
                                = {Number(movement.total_price).toLocaleString('ru-RU')} {item.currency}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Боковая панель */}
          <div className="space-y-6">
            {/* Информация о товаре */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Категория</div>
                  <Badge variant="secondary" className="mt-1">{item.category}</Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Единица измерения</div>
                  <div className="text-foreground">{item.unit}</div>
                </div>
                {item.location && (
                  <div>
                    <div className="text-sm text-muted-foreground">Расположение</div>
                    <div className="text-foreground">{item.location}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Создан</div>
                  <div className="text-foreground text-sm">
                    {new Date(item.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Партии (FIFO) */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Партии (FIFO)</CardTitle>
                <CardDescription>Активные партии для списания</CardDescription>
              </CardHeader>
              <CardContent>
                {activeBatches.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Нет активных партий
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeBatches.map((batch, index) => (
                      <div
                        key={batch.id}
                        className="p-3 rounded-lg bg-secondary/50 border border-border"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">
                            Партия #{index + 1}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {batch.remaining_quantity} из {batch.quantity} {item.unit}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-sm font-mono text-foreground">
                            {Number(batch.purchase_price).toLocaleString('ru-RU')} {batch.currency}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(batch.batch_date).toLocaleDateString('ru-RU')}
                          </div>
                        </div>
                        {batch.supplier && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Поставщик: {batch.supplier}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Диалог деталей движения */}
      {selectedMovement && item && (
        <MovementDetailDialog
          movement={selectedMovement}
          item={item}
          open={showMovementDetail}
          onOpenChange={setShowMovementDetail}
        />
      )}
    </div>
  )
}
