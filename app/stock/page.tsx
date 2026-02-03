import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Package } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StockList } from '@/components/stock/stock-list'
import { AddStockDialog } from '@/components/stock/add-stock-dialog'

export default function StockPage() {
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
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Склад</h1>
                  <p className="text-sm text-muted-foreground">{'Управление товарами и партиями'}</p>
                </div>
              </div>
            </div>
            <AddStockDialog />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Складской учет</CardTitle>
            <CardDescription>{'Товары с остатками и ценами закупки'}</CardDescription>
          </CardHeader>
          <CardContent>
            <StockList />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
