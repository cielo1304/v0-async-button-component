'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { createAutoPurchase } from '@/app/actions/auto'

const CURRENCIES = ['RUB', 'USD', 'USDT', 'EUR'] as const

export function AddCarDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [vin, setVin] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [mileage, setMileage] = useState('')
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null)
  const [purchaseCurrency, setPurchaseCurrency] = useState<typeof CURRENCIES[number]>('USD')
  const [listPrice, setListPrice] = useState<number | null>(null)

  const handleSubmit = async () => {
    if (!brand || !model || !year) {
      toast.error('Заполните обязательные поля: марка, модель, год')
      return
    }

    const yearNum = parseInt(year)
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > new Date().getFullYear() + 1) {
      toast.error('Некорректный год выпуска')
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      
      const { data: newCar, error } = await supabase.from('cars').insert({
        vin: vin || null,
        brand,
        model,
        year: yearNum,
        color: color || null,
        mileage: mileage ? parseInt(mileage) : null,
        status: 'IN_STOCK',
        purchase_price: purchasePrice,
        purchase_currency: purchaseCurrency,
        cost_price: purchasePrice || 0,
        list_price: listPrice,
        list_currency: purchaseCurrency,
      }).select().single()

      if (error) throw error

      // Create purchase record in auto_ledger if purchase price is provided
      if (newCar && purchasePrice && purchasePrice > 0) {
        const purchaseResult = await createAutoPurchase({
          carId: newCar.id,
          supplierName: 'Supplier', // Could add a field for this later
          purchaseAmount: purchasePrice,
          description: `Initial purchase: ${brand} ${model} ${year}`,
        })

        if (!purchaseResult.success) {
          console.error('[v0] Failed to create purchase record:', purchaseResult.error)
          toast.warning('Автомобиль добавлен, но не удалось записать закупку')
        } else {
          toast.success('Автомобиль добавлен с записью о закупке')
        }
      } else {
        toast.success('Автомобиль добавлен')
      }

      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('[v0] Error creating car:', error)
      toast.error('Ошибка при добавлении автомобиля')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setVin('')
    setBrand('')
    setModel('')
    setYear('')
    setColor('')
    setMileage('')
    setPurchasePrice(null)
    setListPrice(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Добавить авто
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Новый автомобиль</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Добавить транспортное средство на склад
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Марка *
              </Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="BMW"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Модель *
              </Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="X5"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Год *
              </Label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2023"
                type="number"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Цвет
              </Label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Черный"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                VIN
              </Label>
              <Input
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="WBA..."
                maxLength={17}
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Пробег (км)
              </Label>
              <Input
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                placeholder="50000"
                type="number"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Валюта
            </Label>
            <Select value={purchaseCurrency} onValueChange={(v) => setPurchaseCurrency(v as typeof CURRENCIES[number])}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Цена закупки
              </Label>
              <MoneyInput
                value={purchasePrice}
                onValueChange={setPurchasePrice}
                currency={purchaseCurrency}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Прайс (продажа)
              </Label>
              <MoneyInput
                value={listPrice}
                onValueChange={setListPrice}
                currency={purchaseCurrency}
                placeholder="0.00"
              />
            </div>
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
            Добавить авто
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
