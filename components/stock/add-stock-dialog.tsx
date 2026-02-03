'use client'

import { useRouter } from "next/navigation"
import { useState } from 'react'
import { mutate } from 'swr'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const CATEGORIES = [
  { value: 'Расходники', label: 'Расходники' },
  { value: 'Запчасти', label: 'Запчасти' },
  { value: 'Шины', label: 'Шины' },
  { value: 'Кузов', label: 'Кузов' },
  { value: 'Электрика', label: 'Электрика' },
  { value: 'Прочее', label: 'Прочее' },
]

export function AddStockDialog() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('')
  const [minQuantity, setMinQuantity] = useState('5')
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null)
  const [salePrice, setSalePrice] = useState<number | null>(null)
  const [location, setLocation] = useState('')

  const handleSubmit = async () => {
    if (!name || !category || !quantity) {
      toast.error('Заполните обязательные поля: название, категория, количество')
      return
    }

    const qty = parseInt(quantity)
    if (isNaN(qty) || qty < 0) {
      toast.error('Некорректное количество')
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      
      // 1. Создаем товар
      const { data: newItem, error } = await supabase.from('stock_items').insert({
        sku: sku || `SKU-${Date.now()}`,
        name,
        category,
        unit: 'шт',
        quantity: qty,
        min_quantity: parseInt(minQuantity) || 5,
        avg_purchase_price: purchasePrice || 0,
        sale_price: salePrice,
        currency: 'RUB',
        location: location || null,
        is_active: true,
      }).select().single()

      if (error) throw error

      // 2. Создаем начальную партию (если указана цена и количество > 0)
      if (newItem && qty > 0 && purchasePrice) {
        await supabase.from('stock_batches').insert({
          item_id: newItem.id,
          quantity: qty,
          remaining_quantity: qty,
          purchase_price: purchasePrice,
          currency: 'RUB',
          supplier: null,
          batch_date: new Date().toISOString().split('T')[0],
        })
      }

      toast.success('Товар добавлен на склад')
      setOpen(false)
      resetForm()
      // Обновляем список через SWR
      mutate('stock_items')
    } catch (error) {
      console.error('[v0] Error creating stock item:', error)
      toast.error('Ошибка при добавлении товара')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setSku('')
    setName('')
    setCategory('')
    setQuantity('')
    setMinQuantity('5')
    setPurchasePrice(null)
    setSalePrice(null)
    setLocation('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Добавить товар
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Новый товар</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Добавить позицию на склад
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Артикул (SKU)
              </Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="OIL-5W40"
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Категория *
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Название *
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Масло моторное 5W-40 5л"
              className="bg-background border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Количество *
              </Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="10"
                type="number"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Мин. остаток
              </Label>
              <Input
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="5"
                type="number"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Цена закупки (RUB)
              </Label>
              <MoneyInput
                value={purchasePrice}
                onValueChange={setPurchasePrice}
                currency="RUB"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Цена продажи (RUB)
              </Label>
              <MoneyInput
                value={salePrice}
                onValueChange={setSalePrice}
                currency="RUB"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Местоположение
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Стеллаж A, полка 3"
              className="bg-background border-border"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            isLoading={isLoading}
            loadingText="Добавление..."
            onClick={handleSubmit}
          >
            Добавить товар
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
