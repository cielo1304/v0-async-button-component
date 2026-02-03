'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StockMovement, StockItem, StockBatch, Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  TrendingUp, TrendingDown, RefreshCw, Archive, Minus,
  Package, Car as CarIcon, ExternalLink, Loader2
} from 'lucide-react'
import Link from 'next/link'

interface MovementDetailDialogProps {
  movement: StockMovement
  item: StockItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MOVEMENT_TYPE_CONFIG: Record<string, { 
  label: string
  icon: typeof TrendingUp
  color: string
  bgColor: string
}> = {
  PURCHASE: { 
    label: 'Закупка', 
    icon: TrendingUp, 
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10'
  },
  SALE: { 
    label: 'Продажа', 
    icon: TrendingDown, 
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10'
  },
  WRITE_OFF: { 
    label: 'Списание', 
    icon: Minus, 
    color: 'text-red-400',
    bgColor: 'bg-red-500/10'
  },
  ADJUSTMENT: { 
    label: 'Корректировка', 
    icon: RefreshCw, 
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10'
  },
  TRANSFER: { 
    label: 'Перемещение', 
    icon: Archive, 
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10'
  },
}

export function MovementDetailDialog({ 
  movement, 
  item, 
  open, 
  onOpenChange 
}: MovementDetailDialogProps) {
  const [batch, setBatch] = useState<StockBatch | null>(null)
  const [car, setCar] = useState<Car | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const loadRelatedData = async () => {
      if (!open) return
      setIsLoading(true)

      try {
        // Загружаем партию если есть
        if (movement.batch_id) {
          const { data: batchData } = await supabase
            .from('stock_batches')
            .select('*')
            .eq('id', movement.batch_id)
            .single()
          
          if (batchData) setBatch(batchData)
        }

        // Загружаем авто если движение связано с car_expenses
        if (movement.reference_type === 'car_expense' && movement.reference_id) {
          const { data: expenseData } = await supabase
            .from('car_expenses')
            .select('car_id')
            .eq('id', movement.reference_id)
            .single()

          if (expenseData?.car_id) {
            const { data: carData } = await supabase
              .from('cars')
              .select('*')
              .eq('id', expenseData.car_id)
              .single()
            
            if (carData) setCar(carData)
          }
        }
      } catch (error) {
        console.error('[v0] Error loading related data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadRelatedData()
  }, [open, movement, supabase])

  const config = MOVEMENT_TYPE_CONFIG[movement.movement_type] || {
    label: movement.movement_type,
    icon: RefreshCw,
    color: 'text-muted-foreground',
    bgColor: 'bg-secondary'
  }
  const Icon = config.icon
  const isPositive = ['PURCHASE'].includes(movement.movement_type) || 
    (movement.movement_type === 'ADJUSTMENT' && movement.quantity > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${config.bgColor}`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <DialogTitle className="text-foreground">{config.label}</DialogTitle>
              <DialogDescription>
                {new Date(movement.created_at).toLocaleString('ru-RU')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Товар */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
            <Package className="h-5 w-5 text-blue-400" />
            <div className="flex-1">
              <div className="font-medium text-foreground">{item.name}</div>
              <div className="text-sm text-muted-foreground font-mono">{item.sku || 'Без артикула'}</div>
            </div>
            <Badge variant="secondary">{item.category}</Badge>
          </div>

          {/* Количество */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="text-sm text-muted-foreground">Количество</div>
              <div className={`text-2xl font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{movement.quantity} {item.unit}
              </div>
            </div>

            {movement.unit_price && (
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="text-sm text-muted-foreground">Цена за единицу</div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {Number(movement.unit_price).toLocaleString('ru-RU')}
                </div>
                <div className="text-xs text-muted-foreground">{item.currency}</div>
              </div>
            )}
          </div>

          {/* Сумма */}
          {movement.total_price && (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="text-sm text-muted-foreground">Общая сумма</div>
              <div className={`text-3xl font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : '-'}{Math.abs(Number(movement.total_price)).toLocaleString('ru-RU')} {item.currency}
              </div>
            </div>
          )}

          {/* Партия */}
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {batch && (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="text-sm text-muted-foreground mb-2">Партия</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Дата партии</div>
                      <div className="text-foreground">
                        {new Date(batch.batch_date).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Цена закупки</div>
                      <div className="text-foreground font-mono">
                        {Number(batch.purchase_price).toLocaleString('ru-RU')} {batch.currency}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Изначально</div>
                      <div className="text-foreground font-mono">
                        {batch.quantity} {item.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Осталось</div>
                      <div className="text-foreground font-mono">
                        {batch.remaining_quantity} {item.unit}
                      </div>
                    </div>
                    {batch.supplier && (
                      <div className="col-span-2">
                        <div className="text-muted-foreground">Поставщик</div>
                        <div className="text-foreground">{batch.supplier}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Связанный автомобиль */}
              {car && (
                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="text-sm text-muted-foreground mb-2">Связанный автомобиль</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CarIcon className="h-5 w-5 text-zinc-400" />
                      <div>
                        <div className="font-medium text-foreground">
                          {car.brand} {car.model}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {car.year} г. {car.color && `• ${car.color}`}
                        </div>
                      </div>
                    </div>
                    <Link href={`/cars/${car.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Примечание */}
          {movement.notes && (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="text-sm text-muted-foreground mb-1">Примечание</div>
              <div className="text-foreground">{movement.notes}</div>
            </div>
          )}

          {/* ID */}
          <div className="text-xs text-muted-foreground font-mono">
            ID: {movement.id}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
