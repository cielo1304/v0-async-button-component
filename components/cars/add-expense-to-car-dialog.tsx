'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wrench, Package, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { recordAutoExpense, recordAutoExpenseV2 } from '@/app/actions/auto'

interface AddExpenseToCarDialogProps {
  carId: string
  carName: string
  onSuccess?: () => void
}

type ExpenseType = 'CASH' | 'STOCK'

const EXPENSE_CATEGORIES = [
  { value: 'REPAIR', label: 'Ремонт' },
  { value: 'PARTS', label: 'Запчасти' },
  { value: 'DETAILING', label: 'Детейлинг' },
  { value: 'LOGISTICS', label: 'Логистика' },
  { value: 'DOCS', label: 'Документы' },
  { value: 'OTHER', label: 'Прочее' },
]

interface Cashbox {
  id: string
  name: string
  currency: string
  balance: number
}

interface StockItem {
  id: string
  name: string
  sku: string
  quantity: number
  avg_purchase_price: number
  currency: string
}

export function AddExpenseToCarDialog({ carId, carName, onSuccess }: AddExpenseToCarDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expenseType, setExpenseType] = useState<ExpenseType>('CASH')
  
  // Cash expense state
  const [cashboxId, setCashboxId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  
  // Stock expense state
  const [stockItemId, setStockItemId] = useState('')
  const [stockQuantity, setStockQuantity] = useState(1)
  const [stockDescription, setStockDescription] = useState('')
  
  // Data
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  async function loadData() {
    // Load cashboxes
    const { data: cashboxData } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('is_hidden', false)
      .order('name')

    if (cashboxData) setCashboxes(cashboxData)

    // Load stock items with quantity > 0
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('*')
      .gt('quantity', 0)
      .eq('is_active', true)
      .order('name')

    if (stockData) setStockItems(stockData)
  }

  async function handleSubmit() {
    setIsLoading(true)

    try {
      if (expenseType === 'CASH') {
        // Validate cash expense
        if (!cashboxId || !amount || amount <= 0 || !category) {
          toast.error('Заполните все обязательные поля')
          return
        }

        // Get cashbox for currency
        const cashbox = cashboxes.find(c => c.id === cashboxId)
        if (!cashbox) {
          toast.error('Касса не найдена')
          return
        }

        // Call server action to record expense atomically
        const result = await recordAutoExpenseV2({
          carId,
          dealId: undefined,
          cashboxId,
          amount,
          currency: cashbox.currency,
          type: category,
          description: description || EXPENSE_CATEGORIES.find(c => c.value === category)?.label,
          paidBy: 'COMPANY',
          ownerShare: 0,
        })

        if (!result.success) {
          throw new Error(result.error || 'Failed to record expense')
        }

        // Add to timeline
        await supabase
          .from('car_timeline')
          .insert({
            car_id: carId,
            event_type: 'EXPENSE',
            description: `${EXPENSE_CATEGORIES.find(c => c.value === category)?.label}: ${description || ''} - ${amount.toLocaleString('ru-RU')} ${cashbox.currency}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        toast.success('Расход добавлен')

      } else {
        // Stock expense (FIFO)
        if (!stockItemId || stockQuantity <= 0) {
          toast.error('Выберите товар и укажите количество')
          return
        }

        const stockItem = stockItems.find(s => s.id === stockItemId)
        if (!stockItem) {
          toast.error('Товар не найден')
          return
        }

        if (stockItem.quantity < stockQuantity) {
          toast.error(`Недостаточно товара на складе. Доступно: ${stockItem.quantity}`)
          return
        }

        // Calculate cost based on average price
        const totalCost = stockItem.avg_purchase_price * stockQuantity

        // 1. Create expense record
        const { error: expenseError } = await supabase
          .from('car_expenses')
          .insert({
            car_id: carId,
            category: 'PARTS',
            amount: totalCost,
            currency: stockItem.currency,
            description: `${stockItem.name} x${stockQuantity} (со склада)`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (expenseError) throw expenseError

        // 2. Update stock quantity
        const { error: stockError } = await supabase
          .from('stock_items')
          .update({ quantity: stockItem.quantity - stockQuantity })
          .eq('id', stockItemId)

        if (stockError) throw stockError

        // 3. Create stock movement record
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            item_id: stockItemId,
            movement_type: 'SALE',
            quantity: -stockQuantity,
            unit_price: stockItem.avg_purchase_price,
            total_price: totalCost,
            reference_type: 'CAR',
            reference_id: carId,
            notes: `Списание на авто ${carName}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        if (movementError) throw movementError

        // 4. Update car cost_price
        const { data: carData } = await supabase
          .from('cars')
          .select('cost_price')
          .eq('id', carId)
          .single()

        if (carData) {
          const newCostPrice = Number(carData.cost_price || 0) + totalCost
          await supabase
            .from('cars')
            .update({ cost_price: newCostPrice })
            .eq('id', carId)
        }

        // 5. Add to timeline
        await supabase
          .from('car_timeline')
          .insert({
            car_id: carId,
            event_type: 'EXPENSE',
            description: `Запчасть со склада: ${stockItem.name} x${stockQuantity} - ${totalCost.toLocaleString('ru-RU')} ${stockItem.currency}`,
            created_by: '00000000-0000-0000-0000-000000000000',
          })

        // 6. Record in auto_ledger for P&L tracking
        const expenseResult = await recordAutoExpense({
          carId,
          amount: totalCost,
          description: `Stock: ${stockItem.name} x${stockQuantity}`,
        })

        if (!expenseResult.success) {
          console.error('[v0] Failed to record auto expense:', expenseResult.error)
        }

        toast.success(`Списано со склада: ${stockItem.name} x${stockQuantity}`)
      }

      // Reset form
      setCashboxId('')
      setAmount(null)
      setCategory('')
      setDescription('')
      setStockItemId('')
      setStockQuantity(1)
      setStockDescription('')
      setOpen(false)
      
      onSuccess?.()

    } catch (error) {
      console.error('[v0] Error adding expense:', error)
      toast.error('Ошибка при добавлении расхода')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedCashbox = cashboxes.find(c => c.id === cashboxId)
  const selectedStockItem = stockItems.find(s => s.id === stockItemId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-amber-500 hover:bg-amber-600 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Добавить расход
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Добавить расход</DialogTitle>
          <DialogDescription>
            Расход на {carName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <TabsTrigger value="CASH" className="data-[state=active]:bg-background">
              <DollarSign className="h-4 w-4 mr-2" />
              Из кассы
            </TabsTrigger>
            <TabsTrigger value="STOCK" className="data-[state=active]:bg-background">
              <Package className="h-4 w-4 mr-2" />
              Со склада
            </TabsTrigger>
          </TabsList>

          <TabsContent value="CASH" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Касса *</Label>
              <Select value={cashboxId} onValueChange={setCashboxId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите кассу" />
                </SelectTrigger>
                <SelectContent>
                  {cashboxes.map((cashbox) => (
                    <SelectItem key={cashbox.id} value={cashbox.id}>
                      {cashbox.name} ({Number(cashbox.balance).toLocaleString('ru-RU')} {cashbox.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Категория *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Сумма *</Label>
              <MoneyInput
                value={amount}
                onChange={setAmount}
                currency={selectedCashbox?.currency || 'RUB'}
                placeholder="0.00"
              />
              {selectedCashbox && (
                <p className="text-xs text-muted-foreground">
                  Доступно: {Number(selectedCashbox.balance).toLocaleString('ru-RU')} {selectedCashbox.currency}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание расхода"
                className="bg-background border-border resize-none"
                rows={2}
              />
            </div>
          </TabsContent>

          <TabsContent value="STOCK" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Товар со склада *</Label>
              <Select value={stockItemId} onValueChange={setStockItemId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите товар" />
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.quantity} шт. @ {Number(item.avg_purchase_price).toLocaleString('ru-RU')} {item.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Количество *</Label>
              <Input
                type="number"
                min={1}
                max={selectedStockItem?.quantity || 999}
                value={stockQuantity}
                onChange={(e) => setStockQuantity(Number(e.target.value))}
                className="bg-background border-border"
              />
              {selectedStockItem && (
                <p className="text-xs text-muted-foreground">
                  Доступно: {selectedStockItem.quantity} шт. | 
                  Итого: {(selectedStockItem.avg_purchase_price * stockQuantity).toLocaleString('ru-RU')} {selectedStockItem.currency}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setOpen(false)} className="border-border">
            Отмена
          </Button>
          <AsyncButton
            onClick={handleSubmit}
            isLoading={isLoading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Wrench className="h-4 w-4 mr-2" />
            Добавить расход
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
