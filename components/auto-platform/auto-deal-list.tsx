'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { AutoDeal, AutoClient, Car } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const DEAL_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  CASH_SALE: { label: 'Наличная', color: 'bg-emerald-500/20 text-emerald-400' },
  COMMISSION_SALE: { label: 'Комиссия', color: 'bg-blue-500/20 text-blue-400' },
  INSTALLMENT: { label: 'Рассрочка', color: 'bg-amber-500/20 text-amber-400' },
  RENT: { label: 'Аренда', color: 'bg-violet-500/20 text-violet-400' },
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  NEW: { label: 'Новая', variant: 'default' },
  IN_PROGRESS: { label: 'В работе', variant: 'info' },
  COMPLETED: { label: 'Завершена', variant: 'success' },
  CANCELLED: { label: 'Отменена', variant: 'error' },
  OVERDUE: { label: 'Просрочена', variant: 'warning' },
}

type DealWithRelations = AutoDeal & {
  buyer?: AutoClient | null
  seller?: AutoClient | null
  car?: Car | null
}

export function AutoDealList() {
  const [deals, setDeals] = useState<DealWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadDeals() {
      try {
        const { data, error } = await supabase
          .from('auto_deals')
          .select(`
            *,
            buyer:auto_clients!auto_deals_buyer_id_fkey(*),
            seller:auto_clients!auto_deals_seller_id_fkey(*),
            car:cars(*)
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        setDeals(data || [])
      } catch (error) {
        console.error('[v0] Error loading auto deals:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDeals()
  }, [])

  const columns = [
    {
      key: 'deal_number',
      header: '№ Сделки',
      className: 'font-mono',
      cell: (row: DealWithRelations) => row.deal_number,
    },
    {
      key: 'deal_type',
      header: 'Тип',
      cell: (row: DealWithRelations) => {
        const config = DEAL_TYPE_CONFIG[row.deal_type]
        return <Badge className={config.color}>{config.label}</Badge>
      },
    },
    {
      key: 'car',
      header: 'Автомобиль',
      cell: (row: DealWithRelations) => {
        if (!row.car) return <span className="text-muted-foreground">-</span>
        return (
          <div>
            <div className="font-medium">{row.car.brand} {row.car.model}</div>
            <div className="text-sm text-muted-foreground">{row.car.year}</div>
          </div>
        )
      },
    },
    {
      key: 'buyer',
      header: 'Покупатель/Арендатор',
      cell: (row: DealWithRelations) => {
        if (!row.buyer) return <span className="text-muted-foreground">-</span>
        return row.buyer.full_name
      },
    },
    {
      key: 'price',
      header: 'Сумма',
      className: 'text-right font-mono',
      cell: (row: DealWithRelations) => {
        if (row.deal_type === 'RENT' && row.rent_price_daily) {
          return (
            <div className="text-right">
              <div>{Number(row.rent_price_daily).toLocaleString()} {row.sale_currency}/день</div>
            </div>
          )
        }
        if (!row.sale_price) return <span className="text-muted-foreground">-</span>
        return (
          <div className="text-right">
            <div>{Number(row.sale_price).toLocaleString()} {row.sale_currency}</div>
            {row.commission_amount && (
              <div className="text-sm text-emerald-400">
                +{Number(row.commission_amount).toLocaleString()} комиссия
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'paid',
      header: 'Оплачено',
      className: 'text-right font-mono',
      cell: (row: DealWithRelations) => {
        const totalPaid = Number(row.total_paid || 0)
        const totalDebt = Number(row.total_debt || 0)
        return (
          <div className="text-right">
            <div className={totalPaid > 0 ? 'text-emerald-400' : ''}>
              {totalPaid.toLocaleString()}
            </div>
            {totalDebt > 0 && (
              <div className="text-sm text-red-400">
                Долг: {totalDebt.toLocaleString()}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Статус',
      cell: (row: DealWithRelations) => {
        const config = STATUS_CONFIG[row.status]
        return <StatusBadge status={config.label} variant={config.variant} />
      },
    },
    {
      key: 'contract_date',
      header: 'Дата',
      cell: (row: DealWithRelations) => (
        <span className="text-muted-foreground text-sm">
          {format(new Date(row.contract_date), 'd MMM yyyy', { locale: ru })}
        </span>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <DataTable
      data={deals}
      columns={columns}
      emptyMessage="Сделок пока нет. Создайте первую сделку."
      onRowClick={(deal) => router.push(`/cars/deals/${deal.id}`)}
    />
  )
}
