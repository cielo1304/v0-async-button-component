'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  ArrowLeft, User, Phone, Mail, Briefcase, Calendar, 
  Wallet, TrendingUp, TrendingDown, Edit, Save, X,
  AlertTriangle, Shield, Clock, Ban, CheckCircle, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface Employee {
  id: string
  full_name: string
  position: string | null
  phone: string | null
  email: string | null
  salary_balance: number
  is_active: boolean
  status: string
  role: string | null
  permissions: string[]
  hired_at: string | null
  fired_at: string | null
  fire_reason: string | null
  notes: string | null
  passport_data: string | null
  address: string | null
  created_at: string
}

interface SalaryOperation {
  id: string
  operation_type: string
  amount: number
  description: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACTIVE: { label: 'Активен', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  ON_LEAVE: { label: 'В отпуске', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Clock },
  FIRED: { label: 'Уволен', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Ban },
  BLOCKED: { label: 'Заблокирован', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'MANAGER', label: 'Менеджер' },
  { value: 'ACCOUNTANT', label: 'Бухгалтер' },
  { value: 'SELLER', label: 'Продавец' },
  { value: 'MECHANIC', label: 'Механик' },
  { value: 'EMPLOYEE', label: 'Сотрудник' },
]

const OPERATION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SALARY: { label: 'Зарплата', color: 'text-emerald-400' },
  BONUS: { label: 'Бонус', color: 'text-emerald-400' },
  ADVANCE: { label: 'Аванс', color: 'text-blue-400' },
  FINE: { label: 'Штраф', color: 'text-red-400' },
  DEDUCTION: { label: 'Удержание', color: 'text-amber-400' },
  PAYOUT: { label: 'Выплата', color: 'text-violet-400' },
}

export default function EmployeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [operations, setOperations] = useState<SalaryOperation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fireDialogOpen, setFireDialogOpen] = useState(false)
  const [fireReason, setFireReason] = useState('')
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    full_name: '',
    position: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
    role: 'EMPLOYEE',
    notes: '',
    passport_data: '',
    address: '',
  })

  const supabase = createClient()

  useEffect(() => {
    loadEmployee()
    loadOperations()
  }, [params.id])

  const loadEmployee = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) throw error
      setEmployee(data)
      setEditForm({
        full_name: data.full_name || '',
        position: data.position || '',
        phone: data.phone || '',
        email: data.email || '',
        status: data.status || 'ACTIVE',
        role: data.role || 'EMPLOYEE',
        notes: data.notes || '',
        passport_data: data.passport_data || '',
        address: data.address || '',
      })
    } catch (error) {
      console.error('[v0] Error loading employee:', error)
      toast.error('Ошибка загрузки данных сотрудника')
    } finally {
      setIsLoading(false)
    }
  }

  const loadOperations = async () => {
    try {
      const { data, error } = await supabase
        .from('salary_operations')
        .select('*')
        .eq('employee_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setOperations(data || [])
    } catch (error) {
      console.error('[v0] Error loading operations:', error)
    }
  }

  const handleSave = async () => {
    if (!employee) return
    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: editForm.full_name,
          position: editForm.position || null,
          phone: editForm.phone || null,
          email: editForm.email || null,
          status: editForm.status,
          role: editForm.role,
          notes: editForm.notes || null,
          passport_data: editForm.passport_data || null,
          address: editForm.address || null,
          is_active: editForm.status === 'ACTIVE' || editForm.status === 'ON_LEAVE',
          updated_at: new Date().toISOString(),
        })
        .eq('id', employee.id)

      if (error) throw error

      toast.success('Данные сотрудника обновлены')
      setIsEditing(false)
      loadEmployee()
    } catch (error) {
      console.error('[v0] Error saving employee:', error)
      toast.error('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFire = async () => {
    if (!employee) return
    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          status: 'FIRED',
          is_active: false,
          fired_at: new Date().toISOString().split('T')[0],
          fire_reason: fireReason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', employee.id)

      if (error) throw error

      toast.success('Сотрудник уволен')
      setFireDialogOpen(false)
      loadEmployee()
    } catch (error) {
      console.error('[v0] Error firing employee:', error)
      toast.error('Ошибка при увольнении')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Сотрудник не найден</h2>
          <Link href="/hr">
            <Button variant="outline" className="mt-4 bg-transparent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Вернуться к списку
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[employee.status] || STATUS_CONFIG.ACTIVE
  const StatusIcon = statusConfig.icon

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/hr">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{employee.full_name}</h1>
                <p className="text-muted-foreground">{employee.position || 'Должность не указана'}</p>
              </div>
              <Badge className={statusConfig.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    <X className="h-4 w-4 mr-2" />
                    Отмена
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Сохранить
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Редактировать
                  </Button>
                  {employee.status !== 'FIRED' && (
                    <Dialog open={fireDialogOpen} onOpenChange={setFireDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive">
                          <Ban className="h-4 w-4 mr-2" />
                          Уволить
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Увольнение сотрудника</DialogTitle>
                          <DialogDescription>
                            Вы уверены, что хотите уволить {employee.full_name}?
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Причина увольнения</Label>
                            <Textarea
                              value={fireReason}
                              onChange={(e) => setFireReason(e.target.value)}
                              placeholder="Укажите причину увольнения..."
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setFireDialogOpen(false)}>
                            Отмена
                          </Button>
                          <Button variant="destructive" onClick={handleFire} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Подтвердить увольнение
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Основная информация */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Личные данные
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>ФИО</Label>
                        <Input
                          value={editForm.full_name}
                          onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Должность</Label>
                        <Input
                          value={editForm.position}
                          onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Телефон</Label>
                        <Input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Адрес</Label>
                      <Input
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Паспортные данные</Label>
                      <Textarea
                        value={editForm.passport_data}
                        onChange={(e) => setEditForm({ ...editForm, passport_data: e.target.value })}
                        placeholder="Серия, номер, кем выдан..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Заметки</Label>
                      <Textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{employee.phone || 'Не указан'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{employee.email || 'Не указан'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">
                        Принят: {employee.hired_at ? new Date(employee.hired_at).toLocaleDateString('ru-RU') : 'Не указано'}
                      </span>
                    </div>
                    {employee.address && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Адрес:</span> {employee.address}
                      </div>
                    )}
                    {employee.notes && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Заметки:</span> {employee.notes}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Роль и права */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Роль и права доступа
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Статус</Label>
                      <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Активен</SelectItem>
                          <SelectItem value="ON_LEAVE">В отпуске</SelectItem>
                          <SelectItem value="BLOCKED">Заблокирован</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Роль</Label>
                      <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-base py-1 px-3">
                      {ROLE_OPTIONS.find((r) => r.value === employee.role)?.label || employee.role || 'Сотрудник'}
                    </Badge>
                    {employee.fired_at && (
                      <div className="text-sm text-red-400">
                        Уволен: {new Date(employee.fired_at).toLocaleDateString('ru-RU')}
                        {employee.fire_reason && <span className="text-muted-foreground ml-2">({employee.fire_reason})</span>}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* История операций */}
            <Card>
              <CardHeader>
                <CardTitle>История начислений и выплат</CardTitle>
                <CardDescription>Последние 50 операций</CardDescription>
              </CardHeader>
              <CardContent>
                {operations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Нет операций
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {operations.map((op) => {
                      const typeConfig = OPERATION_TYPE_LABELS[op.operation_type] || { label: op.operation_type, color: 'text-foreground' }
                      const isPositive = ['SALARY', 'BONUS'].includes(op.operation_type)
                      return (
                        <div
                          key={op.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                        >
                          <div className="flex items-center gap-3">
                            {isPositive ? (
                              <TrendingUp className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-400" />
                            )}
                            <div>
                              <span className={`font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                              {op.description && (
                                <p className="text-xs text-muted-foreground">{op.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? '+' : '-'}{Math.abs(Number(op.amount)).toLocaleString('ru-RU')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(op.created_at).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Баланс */}
          <div className="space-y-6">
            <Card className={Number(employee.salary_balance) >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Баланс по зарплате
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold font-mono ${Number(employee.salary_balance) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Number(employee.salary_balance).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                  <span className="text-lg text-muted-foreground ml-2">RUB</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {Number(employee.salary_balance) > 0 
                    ? 'Компания должна сотруднику' 
                    : Number(employee.salary_balance) < 0 
                    ? 'Сотрудник должен компании'
                    : 'Взаиморасчеты закрыты'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
