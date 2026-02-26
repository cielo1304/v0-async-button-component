import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Car, Briefcase, TrendingUp, Settings, ArrowLeftRight, Users, Landmark, BoxSelect, Building2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CompanyBadge } from '@/components/layout/company-badge'

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
    title: 'Контакты',
    description: 'Единая база клиентов для всех направлений',
    icon: Users,
    href: '/contacts',
    color: 'text-violet-400',
  },
  {
    title: 'Автомобили',
    description: 'Управление ТС, расходы, история',
    icon: Car,
    href: '/cars/stock',
    color: 'text-zinc-100',
  },

  {
    title: 'Сделки',
    description: 'Hub для продаж и контрактов',
    icon: Briefcase,
    href: '/deals',
    color: 'text-amber-400',
  },
  {
    title: 'Финансовые сделки',
    description: 'Займы, кредиты, рассрочки',
    icon: Landmark,
    href: '/finance-deals',
    color: 'text-blue-400',
  },
  {
    title: 'Имущество',
    description: 'Учёт активов и залогов',
    icon: BoxSelect,
    href: '/assets',
    color: 'text-amber-400',
  },
  {
    title: 'Аналитика',
    description: 'Отчеты и статистика',
    icon: TrendingUp,
    href: '/analytics',
    color: 'text-emerald-400',
  },
]

async function checkPlatformAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('is_platform_admin')
    if (error) return false
    return !!data
  } catch {
    return false
  }
}

async function getStats() {
  const supabase = await createClient()

  const safeCount = async (query: Promise<{ count: number | null; error: unknown }>): Promise<number> => {
    try {
      const result = await query
      if ((result as { error: unknown }).error) return 0
      return (result as { count: number | null }).count || 0
    } catch {
      return 0
    }
  }

  const [cashboxCount, carsInStock, activeDeals, stockItems, employeesCount, contactsCount, finDealsCount, assetsCount] =
    await Promise.all([
      safeCount(supabase.from('cashboxes').select('id', { count: 'exact', head: true }).eq('is_archived', false)),
      safeCount(supabase.from('cars').select('id', { count: 'exact', head: true }).eq('status', 'IN_STOCK')),
      safeCount(supabase.from('deals').select('id', { count: 'exact', head: true }).in('status', ['NEW', 'IN_PROGRESS', 'PENDING_PAYMENT'])),
      safeCount(supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('is_active', true)),
      safeCount(supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true)),
      safeCount(supabase.from('contacts').select('id', { count: 'exact', head: true })),
      safeCount(supabase.from('core_deals').select('id', { count: 'exact', head: true }).eq('kind', 'finance').in('status', ['NEW', 'ACTIVE'])),
      safeCount(supabase.from('assets').select('id', { count: 'exact', head: true })),
    ])

  return { cashboxCount, carsInStock, activeDeals, stockItems, employeesCount, contactsCount, finDealsCount, assetsCount }
}

export default async function HomePage() {
  const [stats, isPlatformAdmin] = await Promise.all([getStats(), checkPlatformAdmin()])

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
              <CompanyBadge />
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

          {/* Platform Admin tile — only visible to platform admins */}
          {isPlatformAdmin && (
            <Link href="/platform">
              <Card className="hover:border-zinc-700 transition-all cursor-pointer h-full group bg-card border-border border-dashed">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-lg bg-secondary group-hover:bg-zinc-800 transition-colors">
                      <Building2 className="h-6 w-6 text-rose-400" />
                    </div>
                  </div>
                  <CardTitle className="mt-4 text-foreground">{'Платформа'}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {'Управление компаниями и приглашениями'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-rose-400 group-hover:text-rose-300 transition-colors">{'Только для администраторов'}</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Quick Stats */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Контактов'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-violet-400">{stats.contactsCount}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Фин. сделок'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-400">{stats.finDealsCount}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{'Активов'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-400">{stats.assetsCount}</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
