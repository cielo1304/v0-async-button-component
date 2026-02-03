'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { MoneyInput } from '@/components/ui/money-input'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Employee } from '@/lib/types/database'

const OPERATION_TYPES = [
  { value: 'ACCRUAL', label: 'Начисление зарплаты' },
  { value: 'BONUS', label: 'Бонус' },
  { value: 'FINE', label: 'Штраф' },
  { value: 'ADVANCE', label: 'Аванс' },
]

export function AddBonusDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [operationType, setOperationType] = useState<string>('BONUS')
  const [amount, setAmount] = useState<number | null>(null)
  const [description, setDescription] = useState('')

  useEffect(() => {
    async function loadEmployees() {
      const supabase = createClient()
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
      setEmployees(data || [])
    }
    if (open) loadEmployees()
  }, [open])

  const handleSubmit = async () => {
    if (!selectedEmployeeId || !amount || !operationType) {
      toast.error('Выберите сотрудника, тип операции и сумму')
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      
      // Получаем текущий баланс сотрудника
      const employee = employees.find(e => e.id === selectedEmployeeId)
      if (!employee) throw new Error('Сотрудник не найден')

      // Вычисляем новый баланс
      const isFine = operationType === 'FINE'
      const isPayment = operationType === 'ADVANCE'
      const effectiveAmount = isFine || isPayment ? -amount : amount
      const newBalance = Number(employee.salary_balance) + effectiveAmount

      // Обновляем баланс сотрудника
      const { error: updateError } = await supabase
        .from('employees')
        .update({ salary_balance: newBalance })
        .eq('id', selectedEmployeeId)

      if (updateError) throw updateError

      // Создаем запись о операции
      const { error: opError } = await supabase
        .from('salary_operations')
        .insert({
          employee_id: selectedEmployeeId,
          operation_type: operationType,
          amount: effectiveAmount,
          balance_after: newBalance,
          description: description || OPERATION_TYPES.find(t => t.value === operationType)?.label,
          created_by: '00000000-0000-0000-0000-000000000000', // TODO: заменить на реального пользователя
        })

      if (opError) throw opError

      toast.success('Операция выполнена')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('[v0] Error:', error)
      toast.error('Ошибка операции')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedEmployeeId('')
    setOperationType('BONUS')
    setAmount(null)
    setDescription('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Начислить
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Зарплатная операция</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Начисление, бонус, штраф или аванс
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Сотрудник
            </Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name} ({Number(e.salary_balance).toLocaleString('ru-RU')} RUB)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Тип операции
            </Label>
            <Select value={operationType} onValueChange={setOperationType}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Сумма (RUB)
            </Label>
            <MoneyInput
              value={amount}
              onValueChange={setAmount}
              currency="RUB"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Описание
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Причина начисления..."
              className="bg-background border-border resize-none"
              rows={2}
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            isLoading={isLoading}
            loadingText="Обработка..."
            onClick={handleSubmit}
          >
            Выполнить
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
