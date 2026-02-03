'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Employee } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export function SalaryBalanceList() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadEmployees() {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('is_active', true)
          .order('full_name')

        if (error) throw error
        setEmployees(data || [])
      } catch (error) {
        console.error('[v0] Error loading employees:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadEmployees()
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
      key: 'full_name',
      header: 'Сотрудник',
      cell: (row: Employee) => (
        <div>
          <div className="font-medium text-foreground">{row.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.position || 'Должность не указана'}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Контакты',
      cell: (row: Employee) => (
        <div className="text-sm text-muted-foreground">
          {row.phone && <div>{row.phone}</div>}
          {row.email && <div className="text-xs">{row.email}</div>}
          {!row.phone && !row.email && <span>-</span>}
        </div>
      ),
    },
    {
      key: 'salary_balance',
      header: 'Текущий баланс',
      className: 'text-right font-mono',
      cell: (row: Employee) => {
        const balance = Number(row.salary_balance)
        return (
          <div className={`text-right font-bold ${balance > 0 ? 'text-amber-400' : balance < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
            {balance.toLocaleString('ru-RU', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} RUB
          </div>
        )
      },
    },
    {
      key: 'hired_at',
      header: 'В штате с',
      cell: (row: Employee) => (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.hired_at), 'dd MMM yyyy', { locale: ru })}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Статус',
      cell: (row: Employee) => (
        row.is_active ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            Активен
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
            Неактивен
          </Badge>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      cell: () => (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ),
    },
  ]

  const stats = {
    total: employees.length,
    totalBalance: employees.reduce((sum, e) => sum + Number(e.salary_balance), 0),
    withDebt: employees.filter(e => Number(e.salary_balance) > 0).length,
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-secondary/50">
        <div className="text-sm">
          <div className="text-muted-foreground">Сотрудников</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">К выплате всего</div>
          <div className={`text-xl font-mono font-bold ${stats.totalBalance > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {stats.totalBalance.toLocaleString('ru-RU', { minimumFractionDigits: 0 })} RUB
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground">С задолженностью</div>
          <div className="text-2xl font-bold text-foreground">{stats.withDebt}</div>
        </div>
      </div>

      <DataTable
        data={employees}
        columns={columns}
        emptyMessage="Сотрудников пока нет"
        onRowClick={(row: Employee) => router.push(`/hr/${row.id}`)}
      />
    </div>
  )
}
