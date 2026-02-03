'use client'

import { useState, useEffect } from 'react'
import { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { StockItem, Cashbox } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Minus, RefreshCw } from 'lucide-react'

type OperationType = 'PURCHASE' | 'WRITE_OFF' | 'ADJUSTMENT'

interface StockOperationDialogProps {
  type: OperationType
  item: StockItem
  onSuccess?: () => void
}

const OPERATION_CONFIG: Record<OperationType, { 
  title: string
  description: string
  buttonLabel: string
  icon: typeof Plus
  variant: 'default' | 'destructive' | 'outline'
}> = {
  PURCHASE: {
    title: 'Закупка товара',
    description: 'Добавить новую партию товара на склад',
    buttonLabel: 'Закупка',
    icon: Plus,
    variant: 'default',
  },
  WRITE_OFF: {
    title: 'Списание товара',
    description: 'Списать товар со склада (брак, утеря и т.д.)',
    buttonLabel: 'Списание',
    icon: Minus,
    variant: 'destructive',
  },
  ADJUSTMENT: {
    title: 'Корректировка остатка',
    description: 'Изменить количество товара (инвентаризация)',
    buttonLabel: 'Корректировка',
    icon: RefreshCw,
    variant: 'outline',
  },
}

export function StockOperationDialog({ type, item, onSuccess }: StockOperationDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  
  // Form state
  const [quantity, setQuantity] = useState<number>(1)
  const [price, setPrice] = useState<number | null>(null)
  const [cashboxId, setCashboxId] = useState<string>('')
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [newQuantity, setNewQuantity] = useState<number>(item.quantity)
  const [lastPurchasePrice, setLastPurchasePrice] = useState<number | null>(null)
  const [selectedCashboxCurrency, setSelectedCashboxCurrency] = useState<string>('RUB')

  const config = OPERATION_CONFIG[type]
  const Icon = config.icon
  const supabase = createClient()

  useEffect(() => {
    if (open && type === 'PURCHASE') {
      loadCashboxes()
      loadLastPurchasePrice()
    }
  }, [open, type])

  const loadCashboxes = async () => {
    const { data } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_hidden', false)
      .eq('is_archived', false)
      .order('name')
    setCashboxes(data || [])
  }

  const loadLastPurchasePrice = async () => {
    const { data } = await supabase
      .from('stock_batches')
      .select('purchase_price, currency')
      .eq('item_id', item.id)
      .order('batch_date', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      setLastPurchasePrice(Number(data.purchase_price))
    }
  }

  // Обновляем валюту при выборе кассы
  useEffect(() => {
    if (cashboxId) {
      const cashbox = cashboxes.find(c => c.id === cashboxId)
      if (cashbox) {
        setSelectedCashboxCurrency(cashbox.currency)
      }
    }
  }, [cashboxId, cashboxes])

  const resetForm = () => {
    setQuantity(1)
    setPrice(null)
    setCashboxId('')
    setSupplier('')
    setNotes('')
    setNewQuantity(item.quantity)
  }

  const handleSubmit = async () => {
    setIsLoading(true)

    try {
      if (type === 'PURCHASE') {
        if (!quantity || quantity <= 0) {
          toast.error('Укажите количество')
          setIsLoading(false)
          return
        }
        if (!price || price <= 0) {
          toast.error('Укажите цену закупки')
          setIsLoading(false)
          return
        }
        if (!cashboxId) {
          toast.error('Выберите кассу для оплаты')
          setIsLoading(false)
          return
        }

        const cashbox = cashboxes.find(c => c.id === cashboxId)
        if (!cashbox) {
          toast.error('Касса не найдена')
          return
        }

        const totalCost = price * quantity
        if (Number(cashbox.balance) < totalCost) {
          toast.error(`Недостаточно средств в кассе. Нужно: ${totalCost}, доступно: ${cashbox.balance}`)
          return
        }

        // 1. Создаем партию
        const { error: batchError } = await supabase
          .from('stock_batches')
          .insert({
            item_id: item.id,
            quantity: quantity,
            remaining_quantity: quantity,
            purchase_price: price,
            currency: item.currency,
            supplier: supplier || null,
            batch_date: new Date().toISOString().split('T')[0],
          })

        if (batchError) throw batchError

        // 2. Обновляем остаток и среднюю цену товара
        const newTotalQty = item.quantity + quantity
        const newAvgPrice = ((Number(item.avg_purchase_price) * item.quantity) + (price * quantity)) / newTotalQty

        const { error: itemError } = await supabase
          .from('stock_items')
          .update({
            quantity: newTotalQty,
            avg_purchase_price: newAvgPrice,
          })
          .eq('id', item.id)

        if (itemError) throw itemError

        // 3. Списываем из кассы
        const newBalance = Number(cashbox.balance) - totalCost

        const { error: cashboxError } = await supabase
          .from('cashboxes')
          .update({ balance: newBalance })
          .eq('id', cashboxId)

        if (cashboxError) throw cashboxError

        // 4. Создаем транзакцию
        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            cashbox_id: cashboxId,
            amount: -totalCost,
            balance_after: newBalance,
            category: 'EXPENSE',
            description: `Закупка: ${item.name} x${quantity}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (txError) throw txError

        // 5. Записываем движение
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            item_id: item.id,
            movement_type: 'PURCHASE',
            quantity: quantity,
            unit_price: price,
            total_price: totalCost,
            notes: `${supplier ? `Поставщик: ${supplier}. ` : ''}${notes}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (movementError) throw movementError

        toast.success(`Закупка проведена: ${quantity} ${item.unit} на сумму ${totalCost.toLocaleString('ru-RU')} ${item.currency}`)

      } else if (type === 'WRITE_OFF') {
        if (!quantity || quantity <= 0) {
          toast.error('Укажите количество')
          setIsLoading(false)
          return
        }
        if (quantity > item.quantity) {
          toast.error(`Недостаточно товара. Доступно: ${item.quantity} ${item.unit}`)
          setIsLoading(false)
          return
        }

        // 1. Списываем из партий (FIFO)
        const { data: batches } = await supabase
          .from('stock_batches')
          .select('*')
          .eq('item_id', item.id)
          .gt('remaining_quantity', 0)
          .order('batch_date', { ascending: true })

        let remainingQty = quantity
        let totalCost = 0

        // Если есть партии - списываем из них
        if (batches && batches.length > 0) {
          for (const batch of batches) {
            if (remainingQty <= 0) break

            const qtyToTake = Math.min(batch.remaining_quantity, remainingQty)
            totalCost += qtyToTake * Number(batch.purchase_price)
            remainingQty -= qtyToTake

            const { error } = await supabase
              .from('stock_batches')
              .update({ remaining_quantity: batch.remaining_quantity - qtyToTake })
              .eq('id', batch.id)

            if (error) throw error
          }
        } else {
          // Если партий нет - используем среднюю цену товара
          totalCost = quantity * Number(item.avg_purchase_price)
        }

        // 2. Обновляем остаток товара
        const { error: itemError } = await supabase
          .from('stock_items')
          .update({ quantity: item.quantity - quantity })
          .eq('id', item.id)

        if (itemError) throw itemError

        // 3. Записываем движение
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            item_id: item.id,
            movement_type: 'WRITE_OFF',
            quantity: -quantity,
            unit_price: totalCost / quantity,
            total_price: totalCost,
            notes: notes || 'Списание',
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (movementError) throw movementError

        toast.success(`Списано: ${quantity} ${item.unit} на сумму ${totalCost.toLocaleString('ru-RU')} ${item.currency}`)

      } else if (type === 'ADJUSTMENT') {
        const diff = newQuantity - item.quantity

        if (diff === 0) {
          toast.info('Количество не изменилось')
          setIsLoading(false)
          return
        }

        // 1. Обновляем остаток
        const { error: itemError } = await supabase
          .from('stock_items')
          .update({ quantity: newQuantity })
          .eq('id', item.id)

        if (itemError) throw itemError

        // 2. Записываем движение
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            item_id: item.id,
            movement_type: 'ADJUSTMENT',
            quantity: diff,
            notes: notes || `Корректировка: ${item.quantity} -> ${newQuantity}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (movementError) throw movementError

        toast.success(`Корректировка: ${diff > 0 ? '+' : ''}${diff} ${item.unit}`)
      }

      setOpen(false)
      resetForm()
      // Обновляем данные через SWR
      mutate('stock_items')
      onSuccess?.()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[v0] Stock operation error:', errorMessage)
      toast.error('Ошибка при выполнении операции')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={config.variant} size="sm" className={config.variant === 'default' ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : ''}>
          <Icon className="h-4 w-4 mr-1" />
          {config.buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="font-medium text-foreground">{item.name}</div>
            <div className="text-sm text-muted-foreground font-mono">{item.sku}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Текущий остаток: <span className="font-semibold text-foreground">{item.quantity} {item.unit}</span>
            </div>
            {type === 'PURCHASE' && lastPurchasePrice && (
              <div className="text-sm text-muted-foreground mt-1">
                Последняя закупка: <span className="font-semibold text-amber-400">{lastPurchasePrice.toLocaleString('ru-RU')} {item.currency}</span>
              </div>
            )}
          </div>

          {type === 'PURCHASE' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="quantity">Количество</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="bg-secondary border-border text-foreground"
                  />
                  <span className="text-muted-foreground">{item.unit}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Цена за единицу</Label>
                <MoneyInput
                  value={price}
                  onValueChange={setPrice}
                  currency={item.currency as 'RUB' | 'USD' | 'USDT' | 'EUR'}
                  placeholder="0.00"
                  showCurrency={false}
                />
              </div>

              {price && quantity > 0 && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-sm text-muted-foreground">Итого к оплате:</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    {(price * quantity).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {selectedCashboxCurrency || item.currency}
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="cashbox">Касса для оплаты</Label>
                <Select value={cashboxId} onValueChange={setCashboxId}>
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Выберите кассу" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {cashboxes.map((cashbox) => (
                      <SelectItem key={cashbox.id} value={cashbox.id}>
                        {cashbox.name} ({Number(cashbox.balance).toLocaleString('ru-RU')} {cashbox.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplier">Поставщик (опционально)</Label>
                <Input
                  id="supplier"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Название поставщика"
                  className="bg-secondary border-border text-foreground"
                />
              </div>
            </>
          )}

          {type === 'WRITE_OFF' && (
            <div className="grid gap-2">
              <Label htmlFor="quantity">Количество для списания</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={item.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(Number(e.target.value), item.quantity))}
                  className="bg-secondary border-border text-foreground"
                />
                <span className="text-muted-foreground">{item.unit}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Максимум: {item.quantity} {item.unit}
              </div>
            </div>
          )}

          {type === 'ADJUSTMENT' && (
            <div className="grid gap-2">
              <Label htmlFor="newQuantity">Новое количество</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="newQuantity"
                  type="number"
                  min="0"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(Number(e.target.value))}
                  className="bg-secondary border-border text-foreground"
                />
                <span className="text-muted-foreground">{item.unit}</span>
              </div>
              {newQuantity !== item.quantity && (
                <div className={`text-sm ${newQuantity > item.quantity ? 'text-emerald-400' : 'text-red-400'}`}>
                  Изменение: {newQuantity > item.quantity ? '+' : ''}{newQuantity - item.quantity} {item.unit}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="notes">Комментарий</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Причина операции..."
              className="bg-secondary border-border text-foreground resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-border">
            Отмена
          </Button>
          <AsyncButton
            onClick={handleSubmit}
            isLoading={isLoading}
            loadingText="Выполнение..."
            className={config.variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'}
          >
            {config.buttonLabel}
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
