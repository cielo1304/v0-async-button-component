'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Loader2, ArrowLeft, Car as CarIcon, Wrench, DollarSign, Calendar, Gauge, Hash, Clock, Plus } from 'lucide-react'
import { Car, CarExpense, CarTimeline } from '@/lib/types/database'
import { AddExpenseToCarDialog } from '@/components/cars/add-expense-to-car-dialog'
import { ExpenseDetailDialog } from '@/components/cars/expense-detail-dialog'
import { FileAttachments } from '@/components/files/file-attachments'

const STATUS_MAP: Record<string, 'stock' | 'sold' | 'preparing' | 'reserved' | 'active'> = {
  'IN_STOCK': 'stock',
  'RESERVED': 'reserved',
  'SOLD': 'sold',
  'PREP': 'preparing',
  'IN_TRANSIT': 'active',
  'ARCHIVED': 'sold',
}

const STATUS_LABELS: Record<string, string> = {
  'IN_STOCK': 'На складе',
  'RESERVED': 'Забронирован',
  'SOLD': 'Продан',
  'PREP': 'На подготовке',
  'IN_TRANSIT': 'В пути',
  'ARCHIVED': 'Архив',
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  'REPAIR': 'Ремонт',
  'PARTS': 'Запчасти',
  'DETAILING': 'Детейлинг',
  'LOGISTICS': 'Логистика',
  'DOCS': 'Документы',
  'OTHER': 'Прочее',
}

const TIMELINE_TYPE_LABELS: Record<string, string> = {
  'CREATED': 'Создано',
  'STATUS_CHANGE': 'Изменение статуса',
  'EXPENSE': 'Расход',
  'PRICE_CHANGE': 'Изменение цены',
  'NOTE': 'Заметка',
  'SOLD': 'Продажа',
}

export default function CarDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [car, setCar] = useState<Car | null>(null)
  const [expenses, setExpenses] = useState<CarExpense[]>([])
  const [timeline, setTimeline] = useState<CarTimeline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState<CarExpense | null>(null)
  const [showExpenseDetail, setShowExpenseDetail] = useState(false)
  const supabase = createClient()

  const loadCarData = async () => {
    try {
      const carId = params.id as string

      // Загружаем авто
      const { data: carData, error: carError } = await supabase
        .from('cars')
        .select('*')
        .eq('id', carId)
        .single()

      if (carError) throw carError
      setCar(carData)

      // Загружаем расходы
      const { data: expensesData, error: expensesError } = await supabase
        .from('car_expenses')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: false })

      if (!expensesError) setExpenses(expensesData || [])

      // Загружаем timeline
      const { data: timelineData, error: timelineError } = await supabase
        .from('car_timeline')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: false })

      if (!timelineError) setTimeline(timelineData || [])

    } catch (error) {
      console.error('[v0] Error loading car:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCarData()
  }, [params.id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!car) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Автомобиль не найден</p>
        <Link href="/cars">
          <Button variant="outline">Вернуться к списку</Button>
        </Link>
      </div>
    )
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const margin = car.list_price && car.cost_price && Number(car.cost_price) > 0
    ? ((Number(car.list_price) - Number(car.cost_price)) / Number(car.cost_price)) * 100
    : null

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/cars">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800">
                  <CarIcon className="h-5 w-5 text-zinc-100" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    {car.brand} {car.model}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {car.year} • {car.vin || 'VIN не указан'}
                  </p>
                </div>
              </div>
              <StatusBadge status={STATUS_MAP[car.status] || 'active'} />
            </div>
            <div className="flex items-center gap-2">
              <AddExpenseToCarDialog carId={car.id} carName={`${car.brand} ${car.model}`} onSuccess={loadCarData} />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Info & Expenses */}
          <div className="lg:col-span-2 space-y-6">
            {/* Car Info */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Информация об автомобиле</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Год</div>
                      <div className="font-medium text-foreground">{car.year}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: car.color || '#71717a' }} />
                    <div>
                      <div className="text-xs text-muted-foreground">Цвет</div>
                      <div className="font-medium text-foreground">{car.color || 'Не указан'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Пробег</div>
                      <div className="font-medium text-foreground">
                        {car.mileage ? `${Number(car.mileage).toLocaleString('ru-RU')} км` : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">VIN</div>
                      <div className="font-medium text-foreground font-mono text-sm">
                        {car.vin || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Summary */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Экономика</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Закупка</div>
                    <div className="text-xl font-bold font-mono text-foreground">
                      {car.purchase_price 
                        ? Number(car.purchase_price).toLocaleString('ru-RU')
                        : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">{car.purchase_currency}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Расходы</div>
                    <div className="text-xl font-bold font-mono text-amber-400">
                      +{totalExpenses.toLocaleString('ru-RU')}
                    </div>
                    <div className="text-xs text-muted-foreground">RUB</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Себестоимость</div>
                    <div className="text-xl font-bold font-mono text-foreground">
                      {Number(car.cost_price || 0).toLocaleString('ru-RU')}
                    </div>
                    <div className="text-xs text-muted-foreground">{car.purchase_currency}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Прайс / Маржа</div>
                    <div className="text-xl font-bold font-mono text-emerald-400">
                      {car.list_price ? Number(car.list_price).toLocaleString('ru-RU') : '-'}
                    </div>
                    {margin !== null && (
                      <div className={`text-xs ${margin > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Expenses List */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Расходы</CardTitle>
                  <CardDescription>Список всех расходов на автомобиль</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Расходов пока нет
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedExpense(expense)
                          setShowExpenseDetail(true)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-500/10">
                            <Wrench className="h-4 w-4 text-amber-400" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}
                            </div>
                            {expense.description && (
                              <div className="text-sm text-muted-foreground">{expense.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold font-mono text-amber-400">
                            -{Number(expense.amount).toLocaleString('ru-RU')}
                          </div>
                          <div className="text-xs text-muted-foreground">{expense.currency}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Timeline */}
          <div className="space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  История
                </CardTitle>
                <CardDescription>Timeline изменений</CardDescription>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    История пуста
                  </div>
                ) : (
                  <div className="space-y-4">
                    {timeline.map((event, index) => (
                      <div key={event.id} className="relative pl-6">
                        {index < timeline.length - 1 && (
                          <div className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />
                        )}
                        <div className="absolute left-0 top-1 w-[18px] h-[18px] rounded-full bg-muted border-2 border-border" />
                        <div className="pb-4">
                          <div className="text-sm font-medium text-foreground">
                            {TIMELINE_TYPE_LABELS[event.event_type] || event.event_type}
                          </div>
                          {event.description && (
                            <div className="text-sm text-muted-foreground">{event.description}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(event.created_at).toLocaleString('ru-RU')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Files */}
            <FileAttachments
              entityType="car"
              entityId={car.id}
              allowedKinds={[
                { value: 'photo', label: 'Фото' },
                { value: 'pts', label: 'ПТС' },
                { value: 'sts', label: 'СТС' },
                { value: 'contract', label: 'Договор' },
                { value: 'invoice', label: 'Инвойс' },
                { value: 'inspection', label: 'Осмотр' },
                { value: 'other', label: 'Прочее' },
              ]}
            />

            {/* Notes */}
            {car.notes && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Заметки</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{car.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Диалог деталей расхода */}
      {selectedExpense && car && (
        <ExpenseDetailDialog
          expense={selectedExpense}
          carName={`${car.brand} ${car.model}`}
          open={showExpenseDetail}
          onOpenChange={setShowExpenseDetail}
        />
      )}
    </div>
  )
}
