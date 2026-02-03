'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Car, ArrowRightLeft } from 'lucide-react'

interface TradeInDialogProps {
  dealId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const CONDITION_OPTIONS = [
  { value: 'EXCELLENT', label: 'Отличное' },
  { value: 'GOOD', label: 'Хорошее' },
  { value: 'SATISFACTORY', label: 'Удовлетворительное' },
  { value: 'BAD', label: 'Плохое' },
]

const DISPOSITION_OPTIONS = [
  { value: 'RESALE', label: 'Перепродажа' },
  { value: 'AUCTION', label: 'Аукцион' },
  { value: 'SCRAP', label: 'Утилизация' },
  { value: 'PARTS', label: 'На запчасти' },
]

export function TradeInDialog({ dealId, open, onOpenChange, onSuccess }: TradeInDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  
  // Form state
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [vin, setVin] = useState('')
  const [mileage, setMileage] = useState('')
  const [color, setColor] = useState('')
  const [condition, setCondition] = useState('GOOD')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [ptsNumber, setPtsNumber] = useState('')
  const [stsNumber, setStsNumber] = useState('')
  const [disposition, setDisposition] = useState('RESALE')
  const [notes, setNotes] = useState('')
  
  const supabase = createClient()

  useEffect(() => {
    async function loadBrands() {
      const { data } = await supabase
        .from('auto_brands')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order')
      setBrands(data || [])
    }
    loadBrands()
  }, [])

  const handleSubmit = async () => {
    if (!brand || !model || !estimatedValue) return
    
    setIsLoading(true)
    try {
      const { error } = await supabase.from('auto_trades').insert({
        deal_id: dealId,
        trade_in_brand: brand,
        trade_in_model: model,
        trade_in_year: year ? parseInt(year) : null,
        trade_in_vin: vin || null,
        trade_in_mileage: mileage ? parseInt(mileage) : null,
        trade_in_color: color || null,
        trade_in_condition: condition,
        estimated_value: parseFloat(estimatedValue),
        pts_number: ptsNumber || null,
        sts_number: stsNumber || null,
        disposition,
        notes: notes || null,
        status: 'PENDING',
      })

      if (error) throw error
      
      onSuccess?.()
      onOpenChange(false)
      resetForm()
    } catch (error) {
      console.error('Error creating trade-in:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setBrand('')
    setModel('')
    setYear('')
    setVin('')
    setMileage('')
    setColor('')
    setCondition('GOOD')
    setEstimatedValue('')
    setPtsNumber('')
    setStsNumber('')
    setDisposition('RESALE')
    setNotes('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Trade-in: авто в зачет
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Информация об авто */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Car className="h-4 w-4" />
              Данные автомобиля
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Марка *</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите марку" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Модель *</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Camry, X5, A6..."
                />
              </div>

              <div className="space-y-2">
                <Label>Год выпуска</Label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2020"
                  min={1990}
                  max={new Date().getFullYear()}
                />
              </div>

              <div className="space-y-2">
                <Label>Пробег (км)</Label>
                <Input
                  type="number"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="50000"
                />
              </div>

              <div className="space-y-2">
                <Label>VIN</Label>
                <Input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="WVWZZZ3CZWE123456"
                  maxLength={17}
                />
              </div>

              <div className="space-y-2">
                <Label>Цвет</Label>
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Белый"
                />
              </div>
            </div>
          </div>

          {/* Оценка */}
          <div className="space-y-4">
            <h3 className="font-medium">Оценка</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Состояние *</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Оценочная стоимость (RUB) *</Label>
                <Input
                  type="number"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="500000"
                />
              </div>
            </div>
          </div>

          {/* Документы */}
          <div className="space-y-4">
            <h3 className="font-medium">Документы</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер ПТС</Label>
                <Input
                  value={ptsNumber}
                  onChange={(e) => setPtsNumber(e.target.value)}
                  placeholder="77 УХ 123456"
                />
              </div>

              <div className="space-y-2">
                <Label>Номер СТС</Label>
                <Input
                  value={stsNumber}
                  onChange={(e) => setStsNumber(e.target.value)}
                  placeholder="99 00 123456"
                />
              </div>
            </div>
          </div>

          {/* Дальнейшая судьба */}
          <div className="space-y-2">
            <Label>Что делать с авто после приема</Label>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Примечания */}
          <div className="space-y-2">
            <Label>Примечания</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дефекты, особенности, история..."
              rows={3}
            />
          </div>

          {/* Итого */}
          {estimatedValue && (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Зачет в счет сделки:</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  -{parseInt(estimatedValue).toLocaleString('ru-RU')} RUB
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !brand || !model || !estimatedValue}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Добавить Trade-in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
