'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Deal } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const STATUS_MAP: Record<string, 'active' | 'pending' | 'success' | 'closed' | 'error'> = {
  'NEW': 'active',
  'IN_PROGRESS': 'active',
  'PENDING_PAYMENT': 'pending',
  'PAID': 'success',
  'COMPLETED': 'success',
  'CANCELLED': 'error',
}

interface DealWithCar extends Deal {
  cars?: { brand: string; model: string; year: number } | null
}

export function DealList() {
  const [deals, setDeals] = useState<DealWithCar[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadDeals() {
      try {
        const { data, error } = await supabase
          .from('deals')
          .select(`
            *,
            cars (brand, model, year)
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        setDeals(data || [])
      } catch (error) {
        console.error('[v0] Error loading deals:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDeals()
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
      key: 'deal_number',
      header: '# Сделки',
      cell: (row: DealWithCar) => (
        <div className="font-mono text-sm font-medium text-foreground">{row.deal_number}</div>
      ),
    },
    {
      key: 'client_name',
      header: 'Клиент',
      cell: (row: DealWithCar) => (
        <div>
          <div className="font-medium text-foreground">{row.client_name}</div>
          {row.client_phone && (
            <div className="text-xs text-muted-foreground">{row.client_phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'cars',
      header: 'Автомобиль',
      cell: (row: DealWithCar) =>
        row.cars ? (
          <div className="text-sm text-foreground">
            {row.cars.brand} {row.cars.model}
            <div className="text-xs text-muted-foreground">{row.cars.year}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (row: DealWithCar) => <StatusBadge status={STATUS_MAP[row.status] || 'active'} />,
    },
    {
      key: 'total_amount',
      header: 'Сумма контракта',
      className: 'text-right font-mono',
      cell: (row: DealWithCar) => (
        <div className="text-right">
          <div className="font-semibold text-foreground">
            {Number(row.total_amount).toLocaleString('ru-RU', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.total_currency}
          </div>
        </div>
      ),
    },
    {
      key: 'paid_amount_usd',
      header: 'Оплачено (USD)',
      className: 'text-right font-mono',
      cell: (row: DealWithCar) => {
        const totalUsd = row.total_currency === 'USD' ? Number(row.total_amount) : Number(row.total_amount) / 92.5 // примерный курс
        const paidPercent = totalUsd > 0 ? (Number(row.paid_amount_usd) / totalUsd) * 100 : 0
        return (
          <div className="text-right">
            <div className="font-semibold text-emerald-400">
              ${Number(row.paid_amount_usd).toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              {paidPercent.toFixed(0)}%
            </div>
          </div>
        )
      },
    },
    {
      key: 'debt',
      header: 'Долг',
      className: 'text-right font-mono',
      cell: (row: DealWithCar) => {
        const totalUsd = row.total_currency === 'USD' ? Number(row.total_amount) : Number(row.total_amount) / 92.5
        const debt = totalUsd - Number(row.paid_amount_usd)
        const hasDebt = debt > 0
        return (
          <div className={`text-right font-semibold ${hasDebt ? 'text-red-400' : 'text-muted-foreground'}`}>
            {hasDebt ? '$' : ''}
            {debt.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </div>
        )
      },
    },
    {
      key: 'margin_amount',
      header: 'Прибыль',
      className: 'text-right font-mono',
      cell: (row: DealWithCar) => {
        const margin = Number(row.margin_amount || 0)
        if (margin === 0) return <span className="text-muted-foreground">-</span>
        return (
          <div className={`text-right font-semibold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {margin >= 0 ? '+' : ''}
            {margin.toLocaleString('ru-RU', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
            <div className="text-xs text-muted-foreground">{row.total_currency}</div>
          </div>
        )
      },
    },
    {
      key: 'created_at',
      header: 'Создано',
      cell: (row: DealWithCar) => (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.created_at), 'dd MMM yyyy', { locale: ru })}
        </div>
      ),
    },
  ]

  const stats = {
    total: deals.length,
    active: deals.filter(d => ['NEW', 'IN_PROGRESS', 'PENDING_PAYMENT'].includes(d.status)).length,
    totalPaid: deals.reduce((sum, d) => sum + Number(d.paid_amount_usd), 0),
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-secondary/50">
        <div className="text-sm">
          <div className="text-muted-foreground">Всего сделок</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Активных</div>
          <div className="text-2xl font-bold text-amber-400">{stats.active}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">Оплачено всего</div>
          <div className="text-xl font-mono font-bold text-emerald-400">
            ${stats.totalPaid.toLocaleString('en-US')}
          </div>
        </div>
      </div>

      <DataTable
        data={deals}
        columns={columns}
        emptyMessage="Сделок пока нет. Создайте первую сделку."
        onRowClick={(deal) => router.push(`/deals/${deal.id}`)}
      />
    </div>
  )
}
