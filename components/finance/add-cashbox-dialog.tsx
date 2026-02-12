'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Plus, Eye, EyeOff, Archive, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { GodModeActorSelector } from '@/components/finance/god-mode-actor-selector'
import { createCashbox } from '@/app/actions/cashbox'

const CASHBOX_TYPES = [
  { value: 'CASH', label: 'Наличные' },
  { value: 'BANK', label: 'Банковский счет' },
  { value: 'CRYPTO', label: 'Криптокошелек' },
  { value: 'TRADE_IN', label: 'Trade-In' },
]

const CURRENCIES = ['RUB', 'USD', 'USDT', 'EUR'] as const

interface AddCashboxDialogProps {
  onSuccess?: () => void
}

export function AddCashboxDialog({ onSuccess }: AddCashboxDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('')
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>('RUB')
  const [initialBalance, setInitialBalance] = useState<number | null>(0)
  const [location, setLocation] = useState<string>('')
  const [holderName, setHolderName] = useState('')
  const [holderPhone, setHolderPhone] = useState('')
  const [isHidden, setIsHidden] = useState(false)
  const [isArchived, setIsArchived] = useState(false)
  const [isExchangeEnabled, setIsExchangeEnabled] = useState(false)
  const [godmodeActorId, setGodmodeActorId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (open) {
      loadLocations()
    }
  }, [open])

  const loadLocations = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('cashbox_locations')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
    setLocations(data || [])
  }

  const handleSubmit = async () => {
    if (!name || !type || !currency) {
      toast.error('Заполните все обязательные поля')
      return
    }

    setIsLoading(true)
    try {
      const result = await createCashbox({
        name,
        type,
        currency,
        balance: initialBalance || 0,
        initial_balance: initialBalance || 0,
        location: location || null,
        holder_name: holderName || null,
        holder_phone: holderPhone || null,
        is_hidden: isHidden,
        is_archived: isArchived,
        is_exchange_enabled: isExchangeEnabled,
        actorEmployeeId: godmodeActorId,
      })

      if (!result.success) {
        toast.error(result.error || 'Ошибка при создании кассы')
        return
      }

      toast.success('Касса успешно создана')
      setOpen(false)
      resetForm()
      router.refresh()
      onSuccess?.()
    } catch {
      toast.error('Ошибка при создании кассы')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setName('')
    setType('')
    setCurrency('RUB')
    setInitialBalance(0)
    setLocation('')
    setHolderName('')
    setHolderPhone('')
    setIsHidden(false)
    setIsArchived(false)
    setIsExchangeEnabled(false)
    setGodmodeActorId(undefined)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Добавить кассу
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Новая касса</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Создайте новый кошелек для учета средств
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-muted-foreground uppercase">
                Название *
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Основная касса"
                className="bg-background border-border"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Тип кассы *
              </Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {CASHBOX_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Валюта *
              </Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as typeof CURRENCIES[number])}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Выберите валюту" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground uppercase">
                Начальный баланс
              </Label>
              <MoneyInput
                value={initialBalance}
                onValueChange={setInitialBalance}
                currency={currency}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Локация и ответственный</h4>
            
            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="space-y-2 flex-1">
                  <Label className="text-sm font-medium text-muted-foreground uppercase">
                    Локация
                  </Label>
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Где находится касса" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.name}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2 pb-2">
                  <Switch 
                    id="exchange-enabled-new" 
                    checked={isExchangeEnabled} 
                    onCheckedChange={setIsExchangeEnabled} 
                  />
                  <Label 
                    htmlFor="exchange-enabled-new" 
                    className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
                  >
                    Участвует в обмене валют
                  </Label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground uppercase">
                    Ответственный
                  </Label>
                  <Input
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="ФИО"
                    className="bg-background border-border"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground uppercase">
                    Телефон
                  </Label>
                  <Input
                    value={holderPhone}
                    onChange={(e) => setHolderPhone(e.target.value)}
                    placeholder="+7 (999) 123-45-67"
                    className="bg-background border-border"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Настройки доступа */}
          <div className="border-t border-border pt-4 mt-4">
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              Настройки доступа
            </h4>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-3">
                  {isHidden ? (
                    <EyeOff className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Скрытая касса</p>
                    <p className="text-xs text-muted-foreground">
                      Касса будет видна только администраторам
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isHidden}
                  onCheckedChange={setIsHidden}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-3">
                  <Archive className={`h-5 w-5 ${isArchived ? 'text-red-400' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Архивная касса</p>
                    <p className="text-xs text-muted-foreground">
                      Касса не будет доступна для новых операций
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isArchived}
                  onCheckedChange={setIsArchived}
                />
              </div>
            </div>
          </div>

          {/* God Mode Actor Selector */}
          <GodModeActorSelector
            value={godmodeActorId}
            onChange={setGodmodeActorId}
          />
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            isLoading={isLoading}
            loadingText="Создание..."
            onClick={handleSubmit}
          >
            Создать кассу
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
