'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Users, Shield, Wallet, Plus, Trash2, RefreshCw, Loader2, 
  ChevronRight, Pencil, Mail, Phone, Calendar, Briefcase,
  ArrowLeftRight, Car, Package
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Employee, SystemRole } from '@/lib/types/database'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AddEmployeeDialog } from '@/components/hr/add-employee-dialog'
import { AddBonusDialog } from '@/components/hr/add-bonus-dialog'

// Типы
interface UserWithRoles {
  id: string
  email: string
  roles: SystemRole[]
}

interface EmployeeWithUser extends Employee {
  user_email?: string
  system_roles?: SystemRole[]
}

// Константы модулей
const MODULES = [
  { id: 'exchange', label: 'Обмен валют', icon: ArrowLeftRight, color: 'text-cyan-400' },
  { id: 'deals', label: 'Сделки', icon: Briefcase, color: 'text-amber-400' },
  { id: 'auto', label: 'Автоплощадка', icon: Car, color: 'text-violet-400' },
  { id: 'stock', label: 'Склад', icon: Package, color: 'text-blue-400' },
]

export function TeamManager() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  
  // Состояние
  const [activeTab, setActiveTab] = useState('employees')
  const [isLoading, setIsLoading] = useState(true)
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([])
  const [roles, setRoles] = useState<SystemRole[]>([])
  const [users, setUsers] = useState<UserWithRoles[]>([])
  
  // Диалоги
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithUser | null>(null)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  
  // Загрузка данных
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Загрузка сотрудников
      const { data: employeesData } = await supabase
        .from('employees')
        .select('*')
        .order('full_name')
      
      // Загрузка ролей
      const { data: rolesData } = await supabase
        .from('system_roles')
        .select('*')
        .order('name')
      
      // Загрузка текущего пользователя
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      
      // Загрузка user_roles
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role_id,
          system_roles (*)
        `)
      
      // Группируем роли по пользователям
      const usersMap = new Map<string, UserWithRoles>()
      
      if (currentUser) {
        usersMap.set(currentUser.id, {
          id: currentUser.id,
          email: currentUser.email || 'Неизвестно',
          roles: []
        })
      }
      
      userRolesData?.forEach(ur => {
        const userId = ur.user_id
        if (!usersMap.has(userId)) {
          usersMap.set(userId, {
            id: userId,
            email: 'User ' + userId.slice(0, 8),
            roles: []
          })
        }
        if (ur.system_roles) {
          usersMap.get(userId)!.roles.push(ur.system_roles as SystemRole)
        }
      })
      
      // Добавляем информацию о ролях к сотрудникам
      const employeesWithRoles: EmployeeWithUser[] = (employeesData || []).map(emp => {
        const userInfo = emp.user_id ? usersMap.get(emp.user_id) : null
        return {
          ...emp,
          modules: emp.modules || [],
          user_email: userInfo?.email,
          system_roles: userInfo?.roles || []
        }
      })
      
      setEmployees(employeesWithRoles)
      setRoles(rolesData || [])
      setUsers(Array.from(usersMap.values()))
    } catch (error) {
      console.error('[v0] Error loading team data:', error)
      toast.error('Ошибка загрузки данных')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Обновление сотрудника
  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return
    
    try {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: editingEmployee.full_name,
          position: editingEmployee.position,
          job_title: editingEmployee.job_title,
          phone: editingEmployee.phone,
          email: editingEmployee.email,
          modules: editingEmployee.modules || [],
          hired_at: editingEmployee.hired_at,
          is_active: editingEmployee.is_active
        })
        .eq('id', editingEmployee.id)
      
      if (error) throw error
      
      toast.success('Сотрудник обновлен')
      setIsEditDialogOpen(false)
      setEditingEmployee(null)
      loadData()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  // Назначение роли
  const assignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      toast.error('Выберите пользователя и роль')
      return
    }
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: selectedUserId,
          role_id: selectedRoleId
        })
      
      if (error) {
        if (error.code === '23505') {
          toast.error('У пользователя уже есть эта роль')
        } else {
          throw error
        }
        return
      }
      
      toast.success('Роль назначена')
      setIsRoleDialogOpen(false)
      setSelectedUserId('')
      setSelectedRoleId('')
      loadData()
    } catch {
      toast.error('Ошибка назначения роли')
    }
  }
  
  // Удаление роли
  const removeRole = async (userId: string, roleId: string) => {
    if (!confirm('Удалить эту роль у пользователя?')) return
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId)
      
      if (error) throw error
      
      toast.success('Роль удалена')
      loadData()
    } catch {
      toast.error('Ошибка удаления роли')
    }
  }
  
  // Цвет роли
  const getRoleColor = (code: string) => {
    switch (code) {
      case 'ADMIN': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'MANAGER': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'ACCOUNTANT': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'CASHIER': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }
  
  // Статистика
  const stats = {
    total: employees.length,
    active: employees.filter(e => e.is_active).length,
    totalBalance: employees.reduce((sum, e) => sum + Number(e.salary_balance || 0), 0),
    withDebt: employees.filter(e => Number(e.salary_balance || 0) > 0).length,
    usersWithRoles: users.filter(u => u.roles.length > 0).length,
  }
  
  // Колонки таблицы сотрудников
  const employeeColumns = [
    {
      key: 'full_name',
      header: 'Сотрудник',
      cell: (row: EmployeeWithUser) => (
        <div>
          <div className="font-medium text-foreground">{row.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.job_title || row.position || 'Должность не указана'}
          </div>
        </div>
      ),
    },
    {
      key: 'modules',
      header: 'Модули',
      cell: (row: EmployeeWithUser) => (
        <div className="flex flex-wrap gap-1">
          {(row.modules || []).map(mod => {
            const module = MODULES.find(m => m.id === mod)
            if (!module) return null
            const Icon = module.icon
            return (
              <Badge key={mod} variant="outline" className="text-xs">
                <Icon className={`h-3 w-3 mr-1 ${module.color}`} />
                {module.label}
              </Badge>
            )
          })}
          {(!row.modules || row.modules.length === 0) && (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Контакты',
      cell: (row: EmployeeWithUser) => (
        <div className="text-sm text-muted-foreground space-y-0.5">
          {row.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {row.phone}
            </div>
          )}
          {row.email && (
            <div className="flex items-center gap-1 text-xs">
              <Mail className="h-3 w-3" />
              {row.email}
            </div>
          )}
          {!row.phone && !row.email && <span>-</span>}
        </div>
      ),
    },
    {
      key: 'salary_balance',
      header: 'Баланс ЗП',
      className: 'text-right font-mono',
      cell: (row: EmployeeWithUser) => {
        const balance = Number(row.salary_balance || 0)
        return (
          <div className={`text-right font-bold ${balance > 0 ? 'text-amber-400' : balance < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
            {balance.toLocaleString('ru-RU', { minimumFractionDigits: 0 })} 
          </div>
        )
      },
    },
    {
      key: 'system_roles',
      header: 'Системные роли',
      cell: (row: EmployeeWithUser) => (
        <div className="flex flex-wrap gap-1">
          {(row.system_roles || []).map(role => (
            <Badge key={role.id} variant="outline" className={getRoleColor(role.code)}>
              {role.code}
            </Badge>
          ))}
          {(!row.system_roles || row.system_roles.length === 0) && (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Статус',
      cell: (row: EmployeeWithUser) => (
        row.is_active ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            Активен
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
            Неактивен
          </Badge>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      cell: (row: EmployeeWithUser) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              setEditingEmployee(row)
              setIsEditDialogOpen(true)
            }}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Всего сотрудников</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Активных</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.active}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">К выплате</div>
            <div className={`text-xl font-mono font-bold ${stats.totalBalance > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {stats.totalBalance.toLocaleString('ru-RU')}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">С задолженностью</div>
            <div className="text-2xl font-bold">{stats.withDebt}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">С ролями</div>
            <div className="text-2xl font-bold text-cyan-400">{stats.usersWithRoles}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Подтабы */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Сотрудники
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Роли
            </TabsTrigger>
            <TabsTrigger value="salary" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Зарплаты
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            {activeTab === 'employees' && <AddEmployeeDialog />}
            {activeTab === 'salary' && (
              <>
                <AddEmployeeDialog />
                <AddBonusDialog />
              </>
            )}
            {activeTab === 'roles' && (
              <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Назначить роль
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Назначить роль пользователю</DialogTitle>
                    <DialogDescription>
                      Выберите пользователя и роль для назначения
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Пользователь</Label>
                      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите пользователя" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Роль</Label>
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите роль" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map(r => (
                            <SelectItem key={r.id} value={r.id}>
                              <div className="flex items-center gap-2">
                                <Badge className={getRoleColor(r.code)}>{r.code}</Badge>
                                <span>{r.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button onClick={assignRole} className="w-full">
                      Назначить
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        
        {/* Сотрудники */}
        <TabsContent value="employees">
          <Card>
            <CardContent className="pt-6">
              <DataTable
                data={employees}
                columns={employeeColumns}
                emptyMessage="Сотрудников пока нет"
                onRowClick={(row: EmployeeWithUser) => router.push(`/hr/${row.id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Роли */}
        <TabsContent value="roles">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Роли</TableHead>
                    <TableHead>Сотрудник</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => {
                    const employee = employees.find(e => e.user_id === user.id)
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length > 0 ? (
                              user.roles.map(role => (
                                <Badge key={role.id} variant="outline" className={getRoleColor(role.code)}>
                                  {role.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">Нет ролей</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee ? (
                            <span className="text-sm">{employee.full_name}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Не привязан</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {user.roles.map(role => (
                              <Button
                                key={role.id}
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRole(user.id, role.id)}
                                className="h-6 w-6 text-red-400 hover:text-red-300"
                                title={`Удалить роль ${role.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Нет пользователей
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {/* Справка по ролям */}
              <div className="mt-6 p-4 rounded-lg bg-secondary/30 border border-border">
                <h4 className="text-sm font-medium mb-3">Доступные роли:</h4>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map(role => (
                    <div key={role.id} className="flex items-start gap-2">
                      <Badge variant="outline" className={getRoleColor(role.code)}>{role.code}</Badge>
                      <div>
                        <p className="text-sm font-medium">{role.name}</p>
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Зарплаты */}
        <TabsContent value="salary">
          <Card>
            <CardContent className="pt-6">
              <DataTable
                data={employees.filter(e => e.is_active)}
                columns={[
                  {
                    key: 'full_name',
                    header: 'Сотрудник',
                    cell: (row: EmployeeWithUser) => (
                      <div>
                        <div className="font-medium text-foreground">{row.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.job_title || row.position || 'Должность не указана'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'contact',
                    header: 'Контакты',
                    cell: (row: EmployeeWithUser) => (
                      <div className="text-sm text-muted-foreground">
                        {row.phone && <div>{row.phone}</div>}
                        {row.email && <div className="text-xs">{row.email}</div>}
                        {!row.phone && !row.email && <span>-</span>}
                      </div>
                    ),
                  },
                  {
                    key: 'salary_balance',
                    header: 'Текущий баланс',
                    className: 'text-right font-mono',
                    cell: (row: EmployeeWithUser) => {
                      const balance = Number(row.salary_balance || 0)
                      return (
                        <div className={`text-right font-bold ${balance > 0 ? 'text-amber-400' : balance < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {balance.toLocaleString('ru-RU', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} RUB
                        </div>
                      )
                    },
                  },
                  {
                    key: 'hired_at',
                    header: 'В штате с',
                    cell: (row: EmployeeWithUser) => (
                      <div className="text-sm text-muted-foreground">
                        {row.hired_at ? format(new Date(row.hired_at), 'dd MMM yyyy', { locale: ru }) : '-'}
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-10',
                    cell: () => (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ),
                  },
                ]}
                emptyMessage="Активных сотрудников нет"
                onRowClick={(row: EmployeeWithUser) => router.push(`/hr/${row.id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Диалог редактирования сотрудника */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование сотрудника</DialogTitle>
            <DialogDescription>
              Измените данные сотрудника и сохраните изменения
            </DialogDescription>
          </DialogHeader>
          
          {editingEmployee && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ФИО</Label>
                  <Input
                    value={editingEmployee.full_name}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Должность</Label>
                  <Input
                    value={editingEmployee.job_title || editingEmployee.position || ''}
                    onChange={(e) => setEditingEmployee({ 
                      ...editingEmployee, 
                      job_title: e.target.value,
                      position: e.target.value 
                    })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={editingEmployee.phone || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editingEmployee.email || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Дата приема</Label>
                <Input
                  type="date"
                  value={editingEmployee.hired_at ? editingEmployee.hired_at.split('T')[0] : ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, hired_at: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Модули доступа</Label>
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-secondary/30">
                  {MODULES.map(mod => {
                    const Icon = mod.icon
                    const isChecked = (editingEmployee.modules || []).includes(mod.id)
                    return (
                      <div key={mod.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`module-${mod.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const newModules = checked 
                              ? [...(editingEmployee.modules || []), mod.id]
                              : (editingEmployee.modules || []).filter(m => m !== mod.id)
                            setEditingEmployee({ ...editingEmployee, modules: newModules })
                          }}
                        />
                        <label htmlFor={`module-${mod.id}`} className="flex items-center gap-1 text-sm cursor-pointer">
                          <Icon className={`h-4 w-4 ${mod.color}`} />
                          {mod.label}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="font-medium">Активен</p>
                  <p className="text-sm text-muted-foreground">Сотрудник работает в компании</p>
                </div>
                <Checkbox
                  checked={editingEmployee.is_active}
                  onCheckedChange={(checked) => setEditingEmployee({ 
                    ...editingEmployee, 
                    is_active: checked as boolean 
                  })}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="bg-transparent">
              Отмена
            </Button>
            <Button onClick={handleUpdateEmployee}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
