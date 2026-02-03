import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Briefcase } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DealList } from '@/components/deals/deal-list'
import { AddDealDialog } from '@/components/deals/add-deal-dialog'
import { AddPaymentDialog } from '@/components/deals/add-payment-dialog'

export default function DealsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">{'← Назад'}</Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Briefcase className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Сделки</h1>
                  <p className="text-sm text-muted-foreground">{'Hub для продаж и контрактов'}</p>
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

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Список сделок</CardTitle>
            <CardDescription>{'Все контракты с клиентами и статусами оплат'}</CardDescription>
          </CardHeader>
          <CardContent>
            <DealList />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
