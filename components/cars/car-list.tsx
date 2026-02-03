'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

const STATUS_MAP: Record<string, 'stock' | 'sold' | 'preparing' | 'reserved' | 'active'> = {
  'IN_STOCK': 'stock',
  'RESERVED': 'reserved',
  'SOLD': 'sold',
  'PREP': 'preparing',
  'IN_TRANSIT': 'active',
  'ARCHIVED': 'closed',
}

export function CarList() {
  const [cars, setCars] = useState<Car[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadCars() {
      try {
        const { data, error } = await supabase
          .from('cars')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        setCars(data || [])
      } catch (error) {
        console.error('[v0] Error loading cars:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadCars()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const columns = [
    {
      key: 'brand_model',
      header: 'Автомобиль',
      cell: (row: Car) => (
        <div>
          <div className="font-medium text-foreground">
            {row.brand} {row.model}
          </div>
          <div className="text-sm text-muted-foreground">
            {row.year} • {row.vin || 'VIN не указан'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (row: Car) => <StatusBadge status={STATUS_MAP[row.status] || 'active'} />,
    },
    {
      key: 'purchase_price',
      header: 'Закуплено',
      className: 'text-right font-mono',
      cell: (row: Car) => (
        <div className="text-right">
          {row.purchase_price ? (
            <>
              <div className="font-semibold text-foreground">
                {Number(row.purchase_price).toLocaleString('ru-RU', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.purchase_currency}
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'cost_price',
      header: 'Себестоимость',
      className: 'text-right font-mono',
      cell: (row: Car) => (
        <div className="text-right font-semibold text-foreground">
          {Number(row.cost_price || 0).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </div>
      ),
    },
    {
      key: 'list_price',
      header: 'Прайс',
      className: 'text-right font-mono',
      cell: (row: Car) => (
        <div className="text-right">
          {row.list_price ? (
            <div className="font-semibold text-emerald-400">
              {Number(row.list_price).toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
              <span className="text-xs text-muted-foreground ml-1">{row.list_currency}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Не указано</span>
          )}
        </div>
      ),
    },
    {
      key: 'margin',
      header: 'Маржа',
      className: 'text-right',
      cell: (row: Car) => {
        if (!row.list_price || !row.cost_price || Number(row.cost_price) === 0) {
          return <span className="text-muted-foreground">-</span>
        }
        const margin = ((Number(row.list_price) - Number(row.cost_price)) / Number(row.cost_price)) * 100
        return (
          <div className="text-right">
            <span className={`font-semibold ${margin > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
            </span>
          </div>
        )
      },
    },
    {
      key: 'mileage',
      header: 'Пробег',
      className: 'text-right font-mono',
      cell: (row: Car) => (
        <div className="text-right text-muted-foreground">
          {row.mileage ? `${Number(row.mileage).toLocaleString('ru-RU')} км` : '-'}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      data={cars}
      columns={columns}
      emptyMessage="Автомобилей пока нет. Добавьте первый автомобиль."
      onRowClick={(car) => router.push(`/cars/${car.id}`)}
    />
  )
}
