import { redirect } from 'next/navigation'

// Ghost route - redirects to /exchange
export default async function NewExchangeDealPage() {
  redirect('/exchange')
}

/* 
// DEPRECATED - This route is now a ghost route
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createExchangeDeal, type CreateExchangeDealInput } from '@/app/actions/exchange'
import { X, Plus } from 'lucide-react'

type Leg = {
  id: string
  direction: 'out' | 'in'
  assetKind: 'fiat' | 'crypto' | 'gold' | 'other'
  assetCode: string
  amount: string
  cashboxId: string
  rate: string
  fee: string
}

function NewExchangeDealPageDeprecated() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [dealDate, setDealDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState<'draft' | 'completed' | 'cancelled'>('draft')
  const [comment, setComment] = useState('')
  
  const [legs, setLegs] = useState<Leg[]>([
    {
      id: crypto.randomUUID(),
      direction: 'out',
      assetKind: 'fiat',
      assetCode: 'USD',
      amount: '',
      cashboxId: '',
      rate: '',
      fee: ''
    },
    {
      id: crypto.randomUUID(),
      direction: 'in',
      assetKind: 'fiat',
      assetCode: 'EUR',
      amount: '',
      cashboxId: '',
      rate: '',
      fee: ''
    }
  ])

  const addLeg = () => {
    setLegs([...legs, {
      id: crypto.randomUUID(),
      direction: 'out',
      assetKind: 'fiat',
      assetCode: '',
      amount: '',
      cashboxId: '',
      rate: '',
      fee: ''
    }])
  }

  const removeLeg = (id: string) => {
    if (legs.length <= 2) {
      setError('Минимум 2 операции обязательны')
      return
    }
    setLegs(legs.filter(leg => leg.id !== id))
  }

  const updateLeg = (id: string, field: keyof Leg, value: string) => {
    setLegs(legs.map(leg => 
      leg.id === id ? { ...leg, [field]: value } : leg
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate
    if (!dealDate) {
      setError('Укажите дату сделки')
      return
    }

    if (legs.length < 2) {
      setError('Минимум 2 операции обязательны')
      return
    }

    const hasOut = legs.some(leg => leg.direction === 'out')
    const hasIn = legs.some(leg => leg.direction === 'in')
    if (!hasOut || !hasIn) {
      setError('Нужна минимум 1 исходящая (out) и 1 входящая (in) операция')
      return
    }

    for (const leg of legs) {
      if (!leg.assetCode || !leg.amount || Number(leg.amount) <= 0) {
        setError('Все операции должны иметь код актива и сумму > 0')
        return
      }
    }

    setLoading(true)

    const input: CreateExchangeDealInput = {
      dealDate,
      status,
      comment: comment || undefined,
      legs: legs.map(leg => ({
        direction: leg.direction,
        assetKind: leg.assetKind,
        assetCode: leg.assetCode,
        amount: Number(leg.amount),
        cashboxId: leg.cashboxId || null,
        rate: leg.rate ? Number(leg.rate) : null,
        fee: leg.fee ? Number(leg.fee) : null
      }))
    }

    const result = await createExchangeDeal(input)
    
    if (result.success && result.dealId) {
      router.push(`/exchange-deals/${result.dealId}`)
    } else {
      setError(result.error || 'Ошибка создания сделки')
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Новая сделка обмена</CardTitle>
          <CardDescription>Создайте сделку с несколькими операциями входа/выхода активов</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Deal Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dealDate">Дата сделки</Label>
                <Input
                  id="dealDate"
                  type="date"
                  value={dealDate}
                  onChange={(e) => setDealDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Статус</Label>
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Комментарий</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Опциональный комментарий к сделке"
                rows={2}
              />
            </div>

            {/* Legs */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-semibold">Операции</Label>
                <Button type="button" onClick={addLeg} size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </div>

              {legs.map((leg, index) => (
                <Card key={leg.id} className="relative">
                  <CardContent className="pt-6 space-y-4">
                    {legs.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => removeLeg(leg.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Направление</Label>
                        <Select
                          value={leg.direction}
                          onValueChange={(v: any) => updateLeg(leg.id, 'direction', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="out">Исходящая (OUT)</SelectItem>
                            <SelectItem value="in">Входящая (IN)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Тип актива</Label>
                        <Select
                          value={leg.assetKind}
                          onValueChange={(v: any) => updateLeg(leg.id, 'assetKind', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fiat">Фиат</SelectItem>
                            <SelectItem value="crypto">Крипто</SelectItem>
                            <SelectItem value="gold">Золото</SelectItem>
                            <SelectItem value="other">Другое</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Код актива</Label>
                        <Input
                          placeholder="USD, BTC, XAU..."
                          value={leg.assetCode}
                          onChange={(e) => updateLeg(leg.id, 'assetCode', e.target.value.toUpperCase())}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Сумма</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={leg.amount}
                          onChange={(e) => updateLeg(leg.id, 'amount', e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Курс (опц.)</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="0.00"
                          value={leg.rate}
                          onChange={(e) => updateLeg(leg.id, 'rate', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Комиссия (опц.)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={leg.fee}
                          onChange={(e) => updateLeg(leg.id, 'fee', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? 'Создание...' : 'Создать сделку'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/exchange-deals')}
              >
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
*/
