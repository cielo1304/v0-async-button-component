import { getExchangeDealById } from '@/app/actions/exchange'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PostToCashboxesButton } from '@/components/exchange/post-to-cashboxes-button'

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  completed: 'default',
  cancelled: 'destructive'
}

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  completed: 'Завершена',
  cancelled: 'Отменена'
}

const assetKindLabels: Record<string, string> = {
  fiat: 'Фиат',
  crypto: 'Крипто',
  gold: 'Золото',
  other: 'Другое'
}

export default async function ExchangeDealDetailsPage({ params }: { params: { id: string } }) {
  const { id } = params
  const result = await getExchangeDealById(id)

  if (!result.success || !result.deal) {
    notFound()
  }

  const { deal, legs } = result

  // Check if deal has legs with cashbox_id
  const hasLegsWithCashbox = legs.some(leg => leg.cashbox_id !== null)
  const canPost = hasLegsWithCashbox && deal.status === 'draft'

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/exchange-deals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Детали сделки обмена</h1>
            <p className="text-sm text-muted-foreground">ID: {deal.id}</p>
          </div>
        </div>

        {canPost && (
          <PostToCashboxesButton dealId={deal.id} />
        )}
      </div>

      {/* Deal Info */}
      <Card>
        <CardHeader>
          <CardTitle>Информация о сделке</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Дата сделки</p>
              <p className="font-medium">{new Date(deal.deal_date).toLocaleDateString('ru-RU')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Статус</p>
              <Badge variant={statusVariants[deal.status] || 'default'}>
                {statusLabels[deal.status] || deal.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Создана</p>
              <p className="font-medium">{new Date(deal.created_at).toLocaleString('ru-RU')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Операций</p>
              <p className="font-medium">{legs.length}</p>
            </div>
          </div>

          {deal.comment && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Комментарий</p>
              <p className="text-sm bg-muted p-3 rounded">{deal.comment}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legs */}
      <Card>
        <CardHeader>
          <CardTitle>Операции обмена</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {legs.map((leg) => (
              <div
                key={leg.id}
                className="flex items-start gap-4 p-4 border rounded-lg"
              >
                <div className="flex-shrink-0">
                  {leg.direction === 'out' ? (
                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                      <ArrowUp className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <ArrowDown className="w-5 h-5" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={leg.direction === 'out' ? 'destructive' : 'default'}>
                      {leg.direction === 'out' ? 'Исходящая' : 'Входящая'}
                    </Badge>
                    <Badge variant="outline">
                      {assetKindLabels[leg.asset_kind] || leg.asset_kind}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Актив</p>
                      <p className="font-semibold">{leg.asset_code}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Сумма</p>
                      <p className="font-semibold">{leg.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
                    </div>
                    {leg.rate && (
                      <div>
                        <p className="text-muted-foreground">Курс</p>
                        <p className="font-medium">{leg.rate.toLocaleString('ru-RU', { minimumFractionDigits: 6 })}</p>
                      </div>
                    )}
                    {leg.fee && (
                      <div>
                        <p className="text-muted-foreground">Комиссия</p>
                        <p className="font-medium">{leg.fee.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>

                  {leg.cashbox_id && (
                    <p className="text-xs text-muted-foreground">
                      Касса: {leg.cashbox_id}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
