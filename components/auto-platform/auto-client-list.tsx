'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { AutoClient } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Star, Ban, Phone, Mail } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const CLIENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  BUYER: { label: 'Покупатель', color: 'bg-emerald-500/20 text-emerald-400' },
  SELLER: { label: 'Продавец', color: 'bg-blue-500/20 text-blue-400' },
  RENTER: { label: 'Арендатор', color: 'bg-amber-500/20 text-amber-400' },
  CONSIGNOR: { label: 'Комитент', color: 'bg-violet-500/20 text-violet-400' },
}

export function AutoClientList() {
  const [clients, setClients] = useState<AutoClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadClients() {
      try {
        const { data, error } = await supabase
          .from('auto_clients')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        setClients(data || [])
      } catch (error) {
        console.error('[v0] Error loading auto clients:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadClients()
  }, [])

  const columns = [
    {
      key: 'full_name',
      header: 'ФИО',
      className: 'font-medium',
      cell: (row: AutoClient) => (
        <div className="flex items-center gap-2">
          {row.is_blacklisted && <Ban className="h-4 w-4 text-red-400" />}
          <span className={row.is_blacklisted ? 'text-red-400 line-through' : ''}>
            {row.full_name}
          </span>
        </div>
      ),
    },
    {
      key: 'client_type',
      header: 'Тип',
      cell: (row: AutoClient) => {
        const type = CLIENT_TYPE_LABELS[row.client_type] || { label: row.client_type, color: 'bg-secondary' }
        return <Badge className={type.color}>{type.label}</Badge>
      },
    },
    {
      key: 'phone',
      header: 'Контакты',
      cell: (row: AutoClient) => (
        <div className="space-y-1">
          {row.phone && (
            <div className="flex items-center gap-1 text-sm">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <a href={`tel:${row.phone}`} className="hover:text-primary">{row.phone}</a>
            </div>
          )}
          {row.email && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3 w-3" />
              <a href={`mailto:${row.email}`} className="hover:text-primary">{row.email}</a>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'passport',
      header: 'Паспорт',
      cell: (row: AutoClient) => {
        if (!row.passport_series && !row.passport_number) return <span className="text-muted-foreground">-</span>
        return (
          <span className="font-mono text-sm">
            {row.passport_series} {row.passport_number}
          </span>
        )
      },
    },
    {
      key: 'rating',
      header: 'Рейтинг',
      className: 'text-center',
      cell: (row: AutoClient) => (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${i < row.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Добавлен',
      cell: (row: AutoClient) => (
        <span className="text-muted-foreground text-sm">
          {format(new Date(row.created_at), 'd MMM yyyy', { locale: ru })}
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
      data={clients}
      columns={columns}
      emptyMessage="Клиентов пока нет. Добавьте первого клиента."
      onRowClick={(client) => router.push(`/cars/clients/${client.id}`)}
    />
  )
}
