import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Car, Package, Users, Briefcase, TrendingUp, Settings, ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

const modules = [
  {
    title: 'Финансы',
    description: 'Кассы, обмен валют, транзакции',
    icon: DollarSign,
    href: '/finance',
    color: 'text-emerald-400',
  },
  {
    title: 'Обмен валют',
    description: 'Клиентский обмен, курсы, прибыль',
    icon: ArrowLeftRight,
    href: '/exchange',
    color: 'text-cyan-400',
  },
  {
    title: 'Автомобили',
    description: 'Управление ТС, расходы, история',
    icon: Car,
    href: '/cars',
    color: 'text-zinc-100',
  },
  {
    title: 'Склад',
    description: 'Товары, партии, закупки',
    icon: Package,
    href: '/stock',
    color: 'text-blue-400',
  },
  {
    title: 'Сделки',
    description: 'Hub для продаж и контрактов',
    icon: Briefcase,
    href: '/deals',
    color: 'text-amber-400',
  },
  {
    title: 'HR',
    description: 'Зарплаты, бонусы, сотрудники',
    icon: Users,
    href: '/hr',
    color: 'text-violet-400',
  },
  {
    title: 'Аналитика',
    description: 'Отчеты и статистика',
    icon: TrendingUp,
    href: '/analytics',
    color: 'text-emerald-400',
  },
]

async function getStats() {
  const supabase = await createServerClient()
  
  const [cashboxes, cars, deals, stock, employees] = await Promise.all([
    supabase.from('cashboxes').select('id', { count: 'exact', head: true }).eq('is_archived', false),
    supabase.from('cars').select('id', { count: 'exact', head: true }).eq('status', 'IN_STOCK'),
    supabase.from('deals').select('id', { count: 'exact', head: true }).in('status', ['NEW', 'IN_PROGRESS', 'PENDING_PAYMENT']),
    supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  return {
    cashboxCount: cashboxes.count || 0,
    carsInStock: cars.count || 0,
    activeDeals: deals.count || 0,
    stockItems: stock.count || 0,
    employeesCount: employees.count || 0,
  }
}

export default async function HomePage() {
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">MUTK@</h1>
              <p className="text-sm text-muted-foreground">{'ERP система для управления автомобильным бизнесом'}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground font-mono">v3.0</span>
              <Link href="/settings">
                <Button variant="outline" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link key={module.href} href={module.href}>
              <Card className="hover:border-zinc-700 transition-all cursor-pointer h-full group bg-card border-border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-lg bg-secondary group-hover:bg-zinc-800 transition-colors">
                      <module.icon className={`h-6 w-6 ${module.color}`} />
                    </div>
                  </div>
                  <CardTitle className="mt-4 text-foreground">{module.title}</CardTitle>
                  <CardDescription className="text-muted-foreground">{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-400 group-hover:text-zinc-100 transition-colors">{'Открыть →'}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Всего касс'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stats.cashboxCount}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'ТС на складе'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stats.carsInStock}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Активных сделок'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stats.activeDeals}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Позиций на складе'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stats.stockItems}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Сотрудников'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stats.employeesCount}</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
