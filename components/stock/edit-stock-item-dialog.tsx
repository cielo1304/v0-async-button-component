'use client'

import { useState, useEffect } from 'react'
import { mutate } from 'swr'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, Trash2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { StockItem } from '@/lib/types/database'

interface Warehouse {
  id: string
  name: string
}

interface EditStockItemDialogProps {
  item: StockItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CATEGORIES = [
  { value: 'Расходники', label: 'Расходники' },
  { value: 'Запчасти', label: 'Запчасти' },
  { value: 'Шины', label: 'Шины' },
  { value: 'Кузов', label: 'Кузов' },
  { value: 'Электрика', label: 'Электрика' },
  { value: 'Прочее', label: 'Прочее' },
]

const LOCATIONS = [
  { value: 'Стеллаж A', label: 'Стеллаж A' },
  { value: 'Стеллаж B', label: 'Стеллаж B' },
  { value: 'Стеллаж C', label: 'Стеллаж C' },
  { value: 'Витрина', label: 'Витрина' },
  { value: 'Склад', label: 'Склад' },
]

export function EditStockItemDialog({ item, open, onOpenChange }: EditStockItemDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  
  const [name, setName] = useState(item.name)
  const [sku, setSku] = useState(item.sku)
  const [category, setCategory] = useState(item.category)
  const [minQuantity, setMinQuantity] = useState(item.min_quantity?.toString() || '5')
  const [salePrice, setSalePrice] = useState(item.sale_price?.toString() || '')
  const [location, setLocation] = useState(item.location || '')
  const [warehouseId, setWarehouseId] = useState(item.warehouse_id || '')
  const [notes, setNotes] = useState(item.notes || '')

  const supabase = createClient()

  useEffect(() => {
    if (open) {
      loadWarehouses()
      // Reset form to current item values
      setName(item.name)
      setSku(item.sku)
      setCategory(item.category)
      setMinQuantity(item.min_quantity?.toString() || '5')
      setSalePrice(item.sale_price?.toString() || '')
      setLocation(item.location || '')
      setWarehouseId(item.warehouse_id || '')
      setNotes(item.notes || '')
    }
  }, [open, item])

  const loadWarehouses = async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
    setWarehouses(data || [])
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Введите название товара')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('stock_items')
        .update({
          name: name.trim(),
          sku: sku.trim(),
          category,
          min_quantity: parseInt(minQuantity) || 5,
          sale_price: salePrice ? parseFloat(salePrice) : null,
          location: location || null,
          warehouse_id: warehouseId || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      if (error) throw error

      toast.success('Товар обновлен')
      onOpenChange(false)
      mutate('stock_items')
    } catch (error) {
      console.error('[v0] Error updating stock item:', error)
      toast.error('Ошибка при обновлении товара')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) return

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('stock_items')
        .update({ is_active: false })
        .eq('id', item.id)

      if (error) throw error

      toast.success('Товар удален')
      onOpenChange(false)
      mutate('stock_items')
    } catch (error) {
      console.error('[v0] Error deleting stock item:', error)
      toast.error('Ошибка при удалении товара')
    } finally {
      setIsLoading(false)
    }
  }

  const isLowStock = item.quantity <= (item.min_quantity || 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройки товара</DialogTitle>
          <DialogDescription>{item.sku}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Текущие данные */}
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Текущий остаток:</span>
              <span className={`font-mono font-bold ${isLowStock ? 'text-amber-400' : 'text-foreground'}`}>
                {item.quantity} {item.unit}
                {isLowStock && <AlertTriangle className="h-4 w-4 inline ml-2" />}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-muted-foreground">Ср. цена закупки:</span>
              <span className="font-mono text-foreground">
                {Number(item.avg_purchase_price).toLocaleString('ru-RU')} {item.currency}
              </span>
            </div>
          </div>

          {/* Основные поля */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Артикул</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Мин. остаток</Label>
              <Input
                type="number"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Склад</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите склад" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указан</SelectItem>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Местоположение</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указано</SelectItem>
                  {LOCATIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Цена продажи</Label>
            <Input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="Не указана"
            />
          </div>

          <div className="space-y-2">
            <Label>Заметки</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация..."
            />
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
            <Trash2 className="h-4 w-4 mr-2" />
            Удалить
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
