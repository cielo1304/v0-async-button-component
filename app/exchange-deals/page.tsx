import { Suspense } from 'react'
import { ArrowLeftRight, Calendar, MessageSquare, Layers } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getExchangeDeals, ExchangeDealWithLegs } from '@/app/actions/exchange'

async function ExchangeDealsList() {
  const result = await getExchangeDeals()

  if (!result.success) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Ошибка загрузки: {result.error}</p>
      </div>
    )
  }

  const deals = result.deals

  if (deals.length === 0) {
    return (
      <div className="text-center py-12">
        <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Нет сделок обмена</p>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-emerald-500">Завершено</Badge>
      case 'cancelled':
        return <Badge variant="destructive">Отменено</Badge>
      case 'draft':
      default:
        return <Badge variant="secondary">Черновик</Badge>
    }
  }

  return (
    <div className="space-y-3">
      {deals.map((deal: ExchangeDealWithLegs) => (
        <Card key={deal.id} className="hover:bg-accent/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(deal.deal_date).toLocaleDateString('ru-RU')}</span>
                  </div>
                  {getStatusBadge(deal.status)}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{deal.leg_count || 0} legs</span>
                  </div>
                </div>
                {deal.comment && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{deal.comment}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Link href={`/exchange-deals/${deal.id}`}>
                  <Button variant="outline" size="sm">
                    Подробнее
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default async function ExchangeDealsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  ← Назад
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                <h1 className="text-xl font-semibold text-foreground">Обмен валют (Deals)</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/exchange">
                <Button variant="outline" size="sm">
                  Клиентский обмен
                </Button>
              </Link>
              <Button size="sm" disabled>
                + Новая сделка
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Список сделок обмена</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-muted-foreground mt-4">Загрузка...</p>
              </div>
            }>
              <ExchangeDealsList />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
