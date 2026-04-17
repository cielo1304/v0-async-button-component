import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Car, Briefcase, TrendingUp, Settings, ArrowLeftRight, Users, Landmark, BoxSelect, Building2, Eye, Shield } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CompanyBadge } from '@/components/layout/company-badge'
import { getUserModeContext } from '@/app/actions/platform'

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
  
  // Import dynamically to avoid circular dependencies
  const { getCompanyId } = await import('@/lib/tenant/get-company-id')
  const { data: userData } = await supabase.auth.getUser()
  
  // Get company ID for scoped queries - use empty default if not authenticated
  let companyId: string | null = null
  if (userData?.user) {
    try {
      companyId = await getCompanyId(supabase, userData.user.id)
    } catch {
      // User has no company - stats will return 0
    }
  }
  
  // If no company, return zeros (platform-only users shouldn't see this page anyway)
  if (!companyId) {
    return { cashboxCount: 0, carsInStock: 0, activeDeals: 0, stockItems: 0, employeesCount: 0, contactsCount: 0, finDealsCount: 0, assetsCount: 0 }
  }

  const safeCount = async (query: Promise<{ count: number | null; error: unknown }>): Promise<number> => {
    try {
      const result = await query
      if ((result as { error: unknown }).error) return 0
      return (result as { count: number | null }).count || 0
    } catch {
      return 0
    }
  }

  // ROBUST: Handle missing is_system column gracefully for employees count
  const getEmployeesCount = async (): Promise<number> => {
    try {
      // Try with is_system filter first
      // EXPLICIT COMPANY FILTER: Prevents cross-company data bleed
      const result = await supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('is_system', false)
      
      // If is_system column missing, fallback to counting all active employees
      if (result.error && (result.error.message?.includes('is_system') || result.error.code === '42703')) {
        const fallback = await supabase
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('is_active', true)
        return fallback.count || 0
      }
      
      return result.count || 0
    } catch {
      return 0
    }
  }

  // CANONICAL COMPANY SCOPE: All queries include explicit company_id filter
  // This prevents cross-company data bleed and ensures View-As mode works correctly
  const [cashboxCount, carsInStock, activeDeals, stockItems, employeesCount, contactsCount, finDealsCount, assetsCount] =
    await Promise.all([
      safeCount(supabase.from('cashboxes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_archived', false)),
      safeCount(supabase.from('cars').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'IN_STOCK')),
      safeCount(supabase.from('deals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['NEW', 'IN_PROGRESS', 'PENDING_PAYMENT'])),
      safeCount(supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true)),
      getEmployeesCount(),
      safeCount(supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)),
      safeCount(supabase.from('core_deals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('kind', 'finance').in('status', ['NEW', 'ACTIVE'])),
      safeCount(supabase.from('assets').select('id', { count: 'exact', head: true }).eq('company_id', companyId)),
    ])

  return { cashboxCount, carsInStock, activeDeals, stockItems, employeesCount, contactsCount, finDealsCount, assetsCount }
}

export default async function HomePage() {
  // Get user mode context to determine what UI to show
  const userMode = await getUserModeContext()

  // PLATFORM ADMIN ONLY MODE: No tenant modules, only platform admin UI
  if (userMode.mode === 'platform_admin_only') {
    return <PlatformOnlyLanding />
  }

  // TENANT USER MODE (normal or view-as): Show business modules
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">MUTK@</h1>
              <p className="text-sm text-muted-foreground">
                {userMode.isViewAs ? (
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-amber-500" />
                    {'Режим просмотра: '}
                    <span className="text-amber-500">{userMode.effectiveEmployeeName}</span>
                  </span>
                ) : (
                  'ERP система для управления автомобильным бизнесом'
                )}
              </p>
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

          {/* Platform Admin tile — only visible to platform admins who are also tenant users */}
          {userMode.isPlatformAdmin && !userMode.isViewAs && (
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

/**
 * Platform-only landing page for super admins who are NOT in View-As mode
 * and do NOT have tenant membership.
 * 
 * This is the correct experience for `cielo` outside View-As:
 * - No tenant business modules
 * - Only platform administration functionality
 */
function PlatformOnlyLanding() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">MUTK@</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-rose-400" />
                {'Панель администратора платформы'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground font-mono">v3.0</span>
              <CompanyBadge />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Platform Admin Card */}
          <Link href="/platform">
            <Card className="hover:border-rose-700 transition-all cursor-pointer group bg-card border-border border-rose-900/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-4 rounded-lg bg-rose-950 group-hover:bg-rose-900 transition-colors">
                    <Building2 className="h-8 w-8 text-rose-400" />
                  </div>
                </div>
                <CardTitle className="mt-4 text-xl text-foreground">{'Управление платформой'}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {'Компании, приглашения, режим просмотра'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-rose-400 group-hover:text-rose-300 transition-colors">
                  {'Перейти к администрированию →'}
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Info Section */}
          <Card className="mt-8 bg-card border-border border-dashed">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <Eye className="h-5 w-5 text-amber-500" />
                {'Режим просмотра'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                {'Для просмотра бизнес-модулей компании используйте режим просмотра:'}
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>{'Перейдите в панель администратора платформы'}</li>
                <li>{'Выберите компанию и сотрудника'}</li>
                <li>{'Нажмите "Открыть просмотр"'}</li>
              </ol>
              <p className="text-amber-600 mt-4">
                {'В режиме просмотра все операции доступны только для чтения.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
