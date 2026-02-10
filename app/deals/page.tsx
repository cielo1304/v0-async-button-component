import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Briefcase, Landmark, Car } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DealList } from '@/components/deals/deal-list'
import { AddDealDialog } from '@/components/deals/add-deal-dialog'
import { AddPaymentDialog } from '@/components/deals/add-payment-dialog'
import { UnifiedDealList } from '@/components/deals/unified-deal-list'

export default function DealsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground bg-transparent">{'<- Назад'}</Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Briefcase className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Сделки</h1>
                  <p className="text-sm text-muted-foreground">{'Hub для всех типов сделок'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AddPaymentDialog />
              <AddDealDialog />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Быстрые ссылки на специализированные модули */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/finance-deals">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Landmark className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Финансовые сделки</p>
                    <p className="text-xs text-muted-foreground">{'Займы, кредиты, рассрочки'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/cars">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Car className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium">Автосделки</p>
                    <p className="text-xs text-muted-foreground">{'Покупка, продажа, трейд-ин авто'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Единый список через v_deals_unified */}
        <Card>
          <CardHeader>
            <CardTitle>Единый список сделок</CardTitle>
            <CardDescription>{'Все типы сделок из одного представления с фильтрами'}</CardDescription>
          </CardHeader>
          <CardContent>
            <UnifiedDealList />
          </CardContent>
        </Card>

        {/* Legacy-сделки */}
        <Card>
          <CardHeader>
            <CardTitle>Контракты (legacy)</CardTitle>
            <CardDescription>{'Текущие контракты с клиентами и статусами оплат'}</CardDescription>
          </CardHeader>
          <CardContent>
            <DealList />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
