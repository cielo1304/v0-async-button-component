'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StockItem } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertTriangle, Settings } from 'lucide-react'
import { EditStockItemDialog } from './edit-stock-item-dialog'

const CATEGORY_LABELS: Record<string, string> = {
  'Расходники': 'Расходники',
  'Запчасти': 'Запчасти',
  'Шины': 'Шины',
  'OIL': 'Масла',
  'FILTER': 'Фильтры',
  'TIRE': 'Шины',
  'BRAKE': 'Тормоза',
  'BODY': 'Кузов',
  'ELECTRIC': 'Электрика',
  'OTHER': 'Другое',
}

const fetchStockItems = async () => {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

export function StockList() {
  const router = useRouter()
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const { data: items = [], isLoading } = useSWR<StockItem[]>('stock_items', fetchStockItems, {
    refreshInterval: 0,
    revalidateOnFocus: true,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const columns = [
    {
      key: 'sku',
      header: 'Артикул',
      cell: (row: StockItem) => (
        <div className="font-mono text-sm font-medium text-foreground">{row.sku || '-'}</div>
      ),
    },
    {
      key: 'name',
      header: 'Название',
      cell: (row: StockItem) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          {row.location && (
            <div className="text-xs text-muted-foreground">{row.location}</div>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Категория',
      cell: (row: StockItem) => (
        <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Остаток',
      className: 'text-right',
      cell: (row: StockItem) => {
        const isLow = row.quantity <= row.min_quantity
        return (
          <div className="text-right">
            <div className={`font-semibold ${isLow ? 'text-amber-400' : 'text-foreground'}`}>
              {row.quantity} {row.unit}
              {isLow && <AlertTriangle className="inline-block ml-1 h-3 w-3" />}
            </div>
            {isLow && (
              <div className="text-xs text-muted-foreground">
                (мин: {row.min_quantity})
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'avg_purchase_price',
      header: 'Средняя цена',
      className: 'text-right font-mono',
      cell: (row: StockItem) => (
        <div className="text-right">
          <div className="font-semibold text-foreground">
            {Number(row.avg_purchase_price).toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs text-muted-foreground">{row.currency}</div>
        </div>
      ),
    },
    {
      key: 'sale_price',
      header: 'Цена продажи',
      className: 'text-right font-mono',
      cell: (row: StockItem) => (
        <div className="text-sm text-foreground">
          {row.sale_price
            ? Number(row.sale_price).toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : '-'}
        </div>
      ),
    },
    {
      key: 'total_value',
      header: 'Стоимость',
      className: 'text-right font-mono',
      cell: (row: StockItem) => {
        const totalValue = Number(row.avg_purchase_price) * row.quantity
        return (
          <div className="text-right font-semibold text-emerald-400">
            {totalValue.toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (row: StockItem) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation()
            setEditingItem(row)
          }}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
      ),
    },
  ]

  const totalValue = items.reduce(
    (sum, item) => sum + Number(item.avg_purchase_price) * item.quantity,
    0
  )

  const lowStockCount = items.filter(item => item.quantity <= item.min_quantity).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm text-muted-foreground">
          Всего позиций: <span className="text-foreground font-medium">{items.length}</span>
          {lowStockCount > 0 && (
            <span className="ml-4 text-amber-400">
              <AlertTriangle className="inline-block h-3 w-3 mr-1" />
              Низкий остаток: {lowStockCount}
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          Общая стоимость:{' '}
          <span className="font-mono font-semibold text-foreground">
            {totalValue.toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            RUB
          </span>
        </div>
      </div>

      <DataTable
        data={items}
        columns={columns}
        emptyMessage="Товаров на складе пока нет"
        onRowClick={(item) => router.push(`/stock/${item.id}`)}
      />

      {/* Диалог редактирования товара */}
      {editingItem && (
        <EditStockItemDialog
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}
