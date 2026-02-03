'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, RefreshCw, Star, TrendingUp, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeRate } from '@/lib/types/database'

interface Props {
  onUpdate?: () => void
}

const CURRENCY_FLAGS: Record<string, string> = {
  'RUB': '🇷🇺',
  'USD': '🇺🇸',
  'EUR': '🇪🇺',
  'UAH': '🇺🇦',
  'TRY': '🇹🇷',
  'AED': '🇦🇪',
  'CNY': '🇨🇳',
  'GBP': '🇬🇧',
  'KZT': '🇰🇿',
}

export function ExchangeRatesManager({ onUpdate }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  // Форма
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [marketRate, setMarketRate] = useState('')
  const [isPopular, setIsPopular] = useState(false)
  const [isActive, setIsActive] = useState(true)
  
  const loadRates = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('sort_order')
      
      if (error) throw error
      setRates(data || [])
    } catch {
      toast.error('Ошибка загрузки курсов')
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadRates()
  }, [])
  
  const resetForm = () => {
    setFromCurrency('')
    setToCurrency('')
    setBuyRate('')
    setSellRate('')
    setMarketRate('')
    setIsPopular(false)
    setIsActive(true)
    setEditingRate(null)
  }
  
  const openEditDialog = (rate: ExchangeRate) => {
    setEditingRate(rate)
    setFromCurrency(rate.from_currency)
    setToCurrency(rate.to_currency)
    setBuyRate(rate.buy_rate.toString())
    setSellRate(rate.sell_rate.toString())
    setMarketRate(rate.market_rate?.toString() || '')
    setIsPopular(rate.is_popular)
    setIsActive(rate.is_active)
    setIsDialogOpen(true)
  }
  
  const handleSave = async () => {
    if (!fromCurrency || !toCurrency || !buyRate || !sellRate) {
      toast.error('Заполните все обязательные поля')
      return
    }
    
    try {
      const newBuyRate = parseFloat(buyRate)
      const newSellRate = parseFloat(sellRate)
      const newMarketRate = marketRate ? parseFloat(marketRate) : null
      
      const data = {
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        buy_rate: newBuyRate,
        sell_rate: newSellRate,
        market_rate: newMarketRate,
        is_popular: isPopular,
        is_active: isActive,
        last_updated: new Date().toISOString()
      }
      
      if (editingRate) {
        // Сохраняем в историю изменений (аудит)
        await supabase.from('exchange_rate_history').insert({
          rate_id: editingRate.id,
          from_currency: editingRate.from_currency,
          to_currency: editingRate.to_currency,
          old_buy_rate: editingRate.buy_rate,
          old_sell_rate: editingRate.sell_rate,
          old_market_rate: editingRate.market_rate,
          new_buy_rate: newBuyRate,
          new_sell_rate: newSellRate,
          new_market_rate: newMarketRate
        })
        
        const { error } = await supabase
          .from('exchange_rates')
          .update(data)
          .eq('id', editingRate.id)
        
        if (error) throw error
        toast.success('Курс обновлен')
      } else {
        const { error } = await supabase
          .from('exchange_rates')
          .insert(data)
        
        if (error) throw error
        toast.success('Курс добавлен')
      }
      
      setIsDialogOpen(false)
      resetForm()
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка сохранения')
    }
  }
  
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот курс?')) return
    
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      toast.success('Курс удален')
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка удаления')
    }
  }
  
  const togglePopular = async (rate: ExchangeRate) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_popular: !rate.is_popular })
        .eq('id', rate.id)
      
      if (error) throw error
      loadRates()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  const toggleActive = async (rate: ExchangeRate) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_active: !rate.is_active })
        .eq('id', rate.id)
      
      if (error) throw error
      loadRates()
      onUpdate?.()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  // Расчет маржи
  const calculateMargin = (buy: number, sell: number, market: number | null) => {
    if (!market) return null
    const avgRate = (buy + sell) / 2
    return ((avgRate - market) / market * 100).toFixed(2)
  }
  
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
            Управление курсами
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadRates} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open)
              if (!open) resetForm()
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить курс
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingRate ? 'Редактировать курс' : 'Новый курс'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Из валюты</Label>
                      <Input
                        placeholder="USD"
                        value={fromCurrency}
                        onChange={(e) => setFromCurrency(e.target.value.toUpperCase())}
                        maxLength={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>В валюту</Label>
                      <Input
                        placeholder="RUB"
                        value={toCurrency}
                        onChange={(e) => setToCurrency(e.target.value.toUpperCase())}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Курс покупки</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="89.50"
                        value={buyRate}
                        onChange={(e) => setBuyRate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Мы покупаем у клиента</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Курс продажи</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder="91.50"
                        value={sellRate}
                        onChange={(e) => setSellRate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Мы продаем клиенту</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Рыночный курс (опционально)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="90.50"
                      value={marketRate}
                      onChange={(e) => setMarketRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Для расчета маржи</p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is-popular"
                        checked={isPopular}
                        onCheckedChange={setIsPopular}
                      />
                      <Label htmlFor="is-popular" className="cursor-pointer">
                        Популярная пара
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is-active"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                      <Label htmlFor="is-active" className="cursor-pointer">
                        Активен
                      </Label>
                    </div>
                  </div>
                  
                  <Button onClick={handleSave} className="w-full">
                    {editingRate ? 'Сохранить' : 'Добавить'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пара</TableHead>
              <TableHead className="text-right">Покупка</TableHead>
              <TableHead className="text-right">Продажа</TableHead>
              <TableHead className="text-right">Рыночный</TableHead>
              <TableHead className="text-right">Маржа</TableHead>
              <TableHead className="text-center">Популярная</TableHead>
              <TableHead className="text-center">Активен</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map(rate => (
              <TableRow key={rate.id} className={!rate.is_active ? 'opacity-50' : ''}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{CURRENCY_FLAGS[rate.from_currency] || ''}</span>
                    <span className="font-medium">{rate.from_currency}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span>{CURRENCY_FLAGS[rate.to_currency] || ''}</span>
                    <span className="font-medium">{rate.to_currency}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{rate.buy_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono">{rate.sell_rate.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {rate.market_rate?.toFixed(4) || '-'}
                </TableCell>
                <TableCell className="text-right">
                  {rate.market_rate ? (
                    <span className={`font-mono ${
                      parseFloat(calculateMargin(rate.buy_rate, rate.sell_rate, rate.market_rate) || '0') > 0 
                        ? 'text-emerald-400' 
                        : 'text-red-400'
                    }`}>
                      {calculateMargin(rate.buy_rate, rate.sell_rate, rate.market_rate)}%
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePopular(rate)}
                    className={rate.is_popular ? 'text-amber-400' : 'text-muted-foreground'}
                  >
                    <Star className="h-4 w-4" fill={rate.is_popular ? 'currentColor' : 'none'} />
                  </Button>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={rate.is_active}
                    onCheckedChange={() => toggleActive(rate)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(rate)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rate.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rates.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Нет курсов. Добавьте первый курс.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
