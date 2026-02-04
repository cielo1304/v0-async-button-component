'use client'

import React from "react"

import { useState, useEffect, useMemo } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ExchangeSettings } from '@/lib/types/database'

interface Props {
  settings: ExchangeSettings | null
  onSave?: () => void
  children?: React.ReactNode
}

const CURRENCIES = ['USD', 'EUR', 'RUB', 'UAH', 'TRY', 'AED', 'CNY', 'GBP', 'KZT']

export function ExchangeSettingsDialog({ settings, onSave, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Форма
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [defaultMargin, setDefaultMargin] = useState('2.0')
  const [autoUpdateRates, setAutoUpdateRates] = useState(true)
  const [updateInterval, setUpdateInterval] = useState('15')
  const [requireClientInfo, setRequireClientInfo] = useState(false)
  const [minAmount, setMinAmount] = useState('0')
  const [maxAmount, setMaxAmount] = useState('')
  const [workingHoursStart, setWorkingHoursStart] = useState('09:00')
  const [workingHoursEnd, setWorkingHoursEnd] = useState('21:00')
  
  useEffect(() => {
    if (settings) {
      setBaseCurrency(settings.base_currency)
      setDefaultMargin(settings.default_margin_percent?.toString() || '2.0')
      setAutoUpdateRates(settings.auto_update_rates)
      setUpdateInterval(settings.rate_update_interval_minutes?.toString() || '15')
      setRequireClientInfo(settings.require_client_info)
      setMinAmount(settings.min_exchange_amount?.toString() || '0')
      setMaxAmount(settings.max_exchange_amount?.toString() || '')
      setWorkingHoursStart(settings.working_hours_start || '09:00')
      setWorkingHoursEnd(settings.working_hours_end || '21:00')
    }
  }, [settings])
  
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const data = {
        base_currency: baseCurrency,
        default_margin_percent: parseFloat(defaultMargin) || 2.0,
        auto_update_rates: autoUpdateRates,
        rate_update_interval_minutes: parseInt(updateInterval) || 15,
        require_client_info: requireClientInfo,
        min_exchange_amount: parseFloat(minAmount) || 0,
        max_exchange_amount: maxAmount ? parseFloat(maxAmount) : null,
        working_hours_start: workingHoursStart,
        working_hours_end: workingHoursEnd,
        updated_at: new Date().toISOString()
      }
      
      if (settings?.id) {
        const { error } = await supabase
          .from('exchange_settings')
          .update(data)
          .eq('id', settings.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('exchange_settings')
          .insert(data)
        
        if (error) throw error
      }
      
      toast.success('Настройки сохранены')
      setIsOpen(false)
      onSave?.()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="icon" className="bg-transparent">
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-cyan-400" />
            Настройки обмена валют
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-4">
          {/* Базовая валюта */}
          <div className="space-y-2">
            <Label>Базовая валюта для расчета прибыли</Label>
            <Select value={baseCurrency} onValueChange={setBaseCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              В этой валюте будет считаться прибыль в отчетах
            </p>
          </div>
          
          {/* Маржа по умолчанию */}
          <div className="space-y-2">
            <Label>Маржа по умолчанию (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={defaultMargin}
              onChange={(e) => setDefaultMargin(e.target.value)}
            />
          </div>
          
          {/* Лимиты */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Мин. сумма обмена</Label>
              <Input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Макс. сумма обмена</Label>
              <Input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="Без лимита"
              />
            </div>
          </div>
          
          {/* Рабочие часы */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Начало работы</Label>
              <Input
                type="time"
                value={workingHoursStart}
                onChange={(e) => setWorkingHoursStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Конец работы</Label>
              <Input
                type="time"
                value={workingHoursEnd}
                onChange={(e) => setWorkingHoursEnd(e.target.value)}
              />
            </div>
          </div>
          
          {/* Переключатели */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Автообновление курсов</Label>
                <p className="text-xs text-muted-foreground">Обновлять курсы автоматически</p>
              </div>
              <Switch
                checked={autoUpdateRates}
                onCheckedChange={setAutoUpdateRates}
              />
            </div>
            
            {autoUpdateRates && (
              <div className="space-y-2 pl-4 border-l-2 border-border">
                <Label>Интервал обновления (минут)</Label>
                <Input
                  type="number"
                  value={updateInterval}
                  onChange={(e) => setUpdateInterval(e.target.value)}
                />
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Требовать данные клиента</Label>
                <p className="text-xs text-muted-foreground">ФИО и телефон обязательны</p>
              </div>
              <Switch
                checked={requireClientInfo}
                onCheckedChange={setRequireClientInfo}
              />
            </div>
          </div>
          
          {/* Кнопка сохранения */}
          <Button onClick={handleSave} className="w-full" disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
