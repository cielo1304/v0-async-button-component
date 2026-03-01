'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import {
  Eye,
  EyeOff,
  Archive,
  ShieldAlert,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Cashbox } from '@/lib/types/database'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { updateCashbox, deleteCashbox } from '@/app/actions/cashbox'

const CASHBOX_TYPES = [
  { value: 'CASH', label: 'Наличные' },
  { value: 'BANK', label: 'Банковский счет' },
  { value: 'CRYPTO', label: 'Криптокошелек' },
  { value: 'TRADE_IN', label: 'Trade-In' },
]

interface EditCashboxDialogProps {
  cashbox: Cashbox
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditCashboxDialog({
  cashbox,
  open,
  onOpenChange,
}: EditCashboxDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])

  const [name, setName] = useState(cashbox.name)
  const [type, setType] = useState(cashbox.type)
  const [location, setLocation] = useState(cashbox.location || '')
  const [holderName, setHolderName] = useState(cashbox.holder_name || '')
  const [holderPhone, setHolderPhone] = useState(cashbox.holder_phone || '')
  const [isHidden, setIsHidden] = useState(cashbox.is_hidden)
  const [isArchived, setIsArchived] = useState(cashbox.is_archived)
  const [isExchangeEnabled, setIsExchangeEnabled] = useState((cashbox as any).is_exchange_enabled || false)

  useEffect(() => {
    if (open) {
      loadLocations()
      // Сброс значений при открытии
      setName(cashbox.name)
      setType(cashbox.type)
      setLocation(cashbox.location || '')
      setHolderName(cashbox.holder_name || '')
      setHolderPhone(cashbox.holder_phone || '')
      setIsHidden(cashbox.is_hidden)
      setIsArchived(cashbox.is_archived)
      setIsExchangeEnabled((cashbox as any).is_exchange_enabled || false)
    }
  }, [open, cashbox])

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
    if (!name || !type) {
      toast.error('Заполните все обязательные поля')
      return
    }

    setIsLoading(true)
    try {
      const result = await updateCashbox({
        id: cashbox.id,
        patch: {
          name,
          type,
          location: location || null,
          holder_name: holderName || null,
          holder_phone: holderPhone || null,
          is_hidden: isHidden,
          is_archived: isArchived,
          is_exchange_enabled: isExchangeEnabled,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Ошибка при обновлении кассы')
        return
      }

      toast.success('Касса успешно обновлена')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Ошибка при обновлении кассы')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const result = await deleteCashbox({
        id: cashbox.id,
      })

      if (!result.success) {
        toast.error(result.error || 'Ошибка при удалении кассы')
        setShowDeleteConfirm(false)
        setIsLoading(false)
        return
      }

      toast.success('Касса удалена')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Ошибка при удалении кассы')
    } finally {
      setIsLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      RUB: '₽',
      USD: '$',
      USDT: '₮',
      EUR: '€',
    }
    return symbols[currency] || currency
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Настройки кассы
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Редактирование параметров кассы &quot;{cashbox.name}&quot;
            </DialogDescription>
          </DialogHeader>

          {/* Информация о балансе */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Текущий баланс</p>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {getCurrencySymbol(cashbox.currency)}{' '}
                  {Number(cashbox.balance).toLocaleString('ru-RU', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Валюта</p>
                <p className="text-lg font-medium text-foreground">
                  {cashbox.currency}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 py-4">
            {/* Основные данные */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground uppercase">
                  Название *
                </Label>
                <Input
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

            {/* Локация и ответственный */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-medium text-foreground mb-3">
                Локация и ответственный
              </h4>

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
                        <SelectItem value="default">Не указана</SelectItem>
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
                      id="exchange-enabled" 
                      checked={isExchangeEnabled} 
                      onCheckedChange={setIsExchangeEnabled} 
                    />
                    <Label 
                      htmlFor="exchange-enabled" 
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
                      <p className="text-sm font-medium text-foreground">
                        Скрытая касса
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Касса будет видна только администраторам
                      </p>
                    </div>
                  </div>
                  <Switch checked={isHidden} onCheckedChange={setIsHidden} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center gap-3">
                    <Archive
                      className={`h-5 w-5 ${isArchived ? 'text-red-400' : 'text-muted-foreground'}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Архивная касса
                      </p>
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

            {/* Опасная зона */}
            <div className="border-t border-red-500/30 pt-4 mt-4">
              <h4 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Опасная зона
              </h4>

              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Удалить кассу
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Касса будет удалена безвозвратно. Транзакции будут
                      сохранены.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={Number(cashbox.balance) !== 0}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Удалить
                  </Button>
                </div>
                {Number(cashbox.balance) !== 0 && (
                  <p className="text-xs text-amber-400 mt-2">
                    Для удаления баланс кассы должен быть равен нулю
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <AsyncButton
              isLoading={isLoading}
              loadingText="Сохранение..."
              onClick={handleSubmit}
            >
              Сохранить изменения
            </AsyncButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Удалить кассу?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Вы уверены, что хотите удалить кассу &quot;{cashbox.name}&quot;?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
