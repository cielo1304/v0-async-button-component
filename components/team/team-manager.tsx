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
import { 
  Employee, SystemRole, PositionDefaultRole, EmployeeRole,
  BusinessModule, ModuleAccessLevel, ModuleAccess 
} from '@/lib/types/database'
import { getModuleAccessLevelFromRoles } from '@/lib/access'
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
  employee_roles?: EmployeeRole[]
  computed_module_access?: ModuleAccess
}

// Константы модулей B3
const MODULES: { id: BusinessModule; label: string; icon: typeof ArrowLeftRight; color: string }[] = [
  { id: 'exchange', label: 'Обмен валют', icon: ArrowLeftRight, color: 'text-cyan-400' },
  { id: 'deals', label: 'Сделки', icon: Briefcase, color: 'text-amber-400' },
  { id: 'auto', label: 'Автоплощадка', icon: Car, color: 'text-violet-400' },
  { id: 'stock', label: 'Склад', icon: Package, color: 'text-blue-400' },
]

// Уровни доступа к модулям
const ACCESS_LEVELS: { level: ModuleAccessLevel; label: string; color: string }[] = [
  { level: 'none', label: 'Нет', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  { level: 'view', label: 'Просмотр', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { level: 'work', label: 'Работа', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { level: 'manage', label: 'Управление', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
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
  const [positionDefaults, setPositionDefaults] = useState<(PositionDefaultRole & { role?: SystemRole })[]>([])
  const [editingEmployeeDefaultRoles, setEditingEmployeeDefaultRoles] = useState<SystemRole[]>([])
  
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
      
      // Загрузка employee_roles (source of truth)
      const { data: employeeRolesData } = await supabase
        .from('employee_roles')
        .select(`
          id,
          employee_id,
          role_id,
          assigned_at,
          assigned_by,
          system_roles (*)
        `)
      
      // Также загружаем user_roles для совместимости
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role_id,
          system_roles (*)
        `)
      
      // Загрузка маппинга должностей к ролям
      const { data: positionDefaultsData } = await supabase
        .from('position_default_roles')
        .select(`
          id,
          position,
          system_role_id,
          created_at,
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
      
      // Группируем employee_roles по employee_id
      const employeeRolesMap = new Map<string, EmployeeRole[]>()
      employeeRolesData?.forEach(er => {
        const empId = er.employee_id
        if (!employeeRolesMap.has(empId)) {
          employeeRolesMap.set(empId, [])
        }
        employeeRolesMap.get(empId)!.push({
          id: er.id,
          employee_id: er.employee_id,
          role_id: er.role_id,
          assigned_at: er.assigned_at,
          assigned_by: er.assigned_by,
          role: er.system_roles as SystemRole
        })
      })
      
      // Добавляем информацию о ролях к сотрудникам
      const employeesWithRoles: EmployeeWithUser[] = (employeesData || []).map(emp => {
        const userInfo = emp.user_id ? usersMap.get(emp.user_id) : 
                        emp.auth_user_id ? usersMap.get(emp.auth_user_id) : null
        const empRoles = employeeRolesMap.get(emp.id) || []
        const systemRoles = empRoles.map(er => er.role).filter((r): r is SystemRole => r !== undefined)
        
        // Вычисляем доступ к модулям на основе ролей
        const computedModuleAccess: ModuleAccess = {
          exchange: getModuleAccessLevelFromRoles(systemRoles, 'exchange'),
          auto: getModuleAccessLevelFromRoles(systemRoles, 'auto'),
          deals: getModuleAccessLevelFromRoles(systemRoles, 'deals'),
          stock: getModuleAccessLevelFromRoles(systemRoles, 'stock'),
        }
        
        return {
          ...emp,
          modules: emp.modules || [],
          user_email: userInfo?.email,
          system_roles: systemRoles,
          employee_roles: empRoles,
          computed_module_access: computedModuleAccess
        }
      })
      
      setEmployees(employeesWithRoles)
      setRoles(rolesData || [])
      setUsers(Array.from(usersMap.values()))
      setPositionDefaults((positionDefaultsData || []).map(pd => ({
        ...pd,
        role: pd.system_roles as SystemRole
      })))
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
  
  // Назначение роли сотруднику (через employee_roles)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  
  const assignRole = async () => {
    if (!selectedEmployeeId || !selectedRoleId) {
      toast.error('Выберите сотрудника и роль')
      return
    }
    
    try {
      const { error } = await supabase
        .from('employee_roles')
        .insert({
          employee_id: selectedEmployeeId,
          role_id: selectedRoleId
        })
      
      if (error) {
        if (error.code === '23505') {
          toast.error('У сотрудника уже есть эта роль')
        } else {
          throw error
        }
        return
      }
      
      toast.success('Роль назначена')
      setIsRoleDialogOpen(false)
      setSelectedEmployeeId('')
      setSelectedRoleId('')
      loadData()
    } catch {
      toast.error('Ошибка назначения роли')
    }
  }
  
  // Получить роли по умолчанию для должности
  const getDefaultRolesForPosition = useCallback((position: string | null) => {
    if (!position) return []
    return positionDefaults
      .filter(pd => pd.position.toLowerCase() === position.toLowerCase())
      .map(pd => pd.role)
      .filter((r): r is SystemRole => r !== undefined)
  }, [positionDefaults])
  
  // При открытии редактирования сотрудника загружаем роли по умолчанию
  useEffect(() => {
    if (editingEmployee) {
      const defaultRoles = getDefaultRolesForPosition(editingEmployee.position || editingEmployee.job_title)
      setEditingEmployeeDefaultRoles(defaultRoles)
    }
  }, [editingEmployee, getDefaultRolesForPosition])
  
  // Применить роли по умолчанию к сотруднику (через employee_roles)
  const applyDefaultRoles = async () => {
    if (!editingEmployee) {
      toast.error('Сотрудник не выбран')
      return
    }
    
    const currentRoleIds = editingEmployee.system_roles?.map(r => r.id) || []
    const rolesToAdd = editingEmployeeDefaultRoles.filter(r => !currentRoleIds.includes(r.id))
    
    if (rolesToAdd.length === 0) {
      toast.info('Все роли по умолчанию уже назначены')
      return
    }
    
    try {
      for (const role of rolesToAdd) {
        await supabase
          .from('employee_roles')
          .insert({ employee_id: editingEmployee.id, role_id: role.id })
      }
      toast.success(`Назначено ${rolesToAdd.length} роль(ей)`)
      setIsEditDialogOpen(false)
      loadData()
    } catch {
      toast.error('Ошибка назначения ролей')
    }
  }

  // Удаление роли у сотрудника (через employee_roles)
  const removeRole = async (employeeId: string, roleId: string) => {
    if (!confirm('Удалить эту роль у сотрудника?')) return
    
    try {
      const { error } = await supabase
        .from('employee_roles')
        .delete()
        .eq('employee_id', employeeId)
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
      header: 'Доступ к модулям',
      cell: (row: EmployeeWithUser) => {
        const access = row.computed_module_access || {}
        return (
          <div className="flex flex-wrap gap-1">
            {MODULES.map(mod => {
              const level = access[mod.id] || 'none'
              if (level === 'none') return null
              const Icon = mod.icon
              const accessInfo = ACCESS_LEVELS.find(a => a.level === level)
              return (
                <Badge key={mod.id} variant="outline" className={`text-xs ${accessInfo?.color}`}>
                  <Icon className={`h-3 w-3 mr-1 ${mod.color}`} />
                  {accessInfo?.label}
                </Badge>
              )
            })}
            {Object.values(access).every(l => l === 'none' || !l) && (
              <span className="text-muted-foreground text-xs">Нет доступа</span>
            )}
          </div>
        )
      },
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
            <TabsTrigger value="positions" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Должности
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
                    <DialogTitle>Назначить роль сотруднику</DialogTitle>
                    <DialogDescription>
                      Выберите сотрудника и роль для назначения. Роли назначаются сотрудникам напрямую.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Сотрудник</Label>
                      <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите сотрудника" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.filter(e => e.is_active).map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name} {emp.position ? `(${emp.position})` : ''}
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
                    <TableHead>Сотрудник</TableHead>
                    <TableHead>Должность</TableHead>
                    <TableHead>Роли RBAC</TableHead>
                    <TableHead>Доступ к модулям</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.filter(e => e.is_active).map(emp => {
                    const empRoles = emp.system_roles || []
                    const access = emp.computed_module_access || {}
                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="font-medium">{emp.full_name}</span>
                              {emp.auth_user_id && (
                                <Badge variant="outline" className="ml-2 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                  Auth
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{emp.position || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {empRoles.length > 0 ? (
                              empRoles.map(role => (
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
                          <div className="flex flex-wrap gap-1">
                            {MODULES.map(mod => {
                              const level = access[mod.id] || 'none'
                              if (level === 'none') return null
                              const Icon = mod.icon
                              return (
                                <span key={mod.id} className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <Icon className={`h-3 w-3 ${mod.color}`} />
                                </span>
                              )
                            })}
                            {Object.values(access).every(l => l === 'none' || !l) && (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {empRoles.map(role => (
                              <Button
                                key={role.id}
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRole(emp.id, role.id)}
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
                  {employees.filter(e => e.is_active).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Нет активных сотрудников
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {/* Справка по ролям - группировка по модулям */}
              <div className="mt-6 space-y-4">
                {/* Системные роли */}
                <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                  <h4 className="text-sm font-medium mb-3">Системные роли:</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {roles.filter(r => r.module === 'system' || !r.module).map(role => (
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
                
                {/* Роли по модулям B3 */}
                <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                  <h4 className="text-sm font-medium mb-3">Роли модулей B3:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {MODULES.map(mod => {
                      const moduleRoles = roles.filter(r => r.module === mod.id)
                      const Icon = mod.icon
                      return (
                        <div key={mod.id} className="space-y-2">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Icon className={`h-4 w-4 ${mod.color}`} />
                            {mod.label}
                          </div>
                          <div className="space-y-1">
                            {moduleRoles.map(role => (
                              <div key={role.id} className="text-xs text-muted-foreground">
                                {role.code?.replace(`${mod.id.toUpperCase()}_`, '')}
                              </div>
                            ))}
                            {moduleRoles.length === 0 && (
                              <div className="text-xs text-muted-foreground">-</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Должности -> Роли по умолчанию */}
        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-amber-400" />
                Маппинг должностей к RBAC ролям
              </CardTitle>
              <CardDescription>
                При назначении должности сотруднику предлагаются роли по умолчанию. Можно применить автоматически или изменить вручную.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Должность</TableHead>
                    <TableHead>Роли по умолчанию</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(new Set(positionDefaults.map(pd => pd.position))).map(position => {
                    const rolesForPosition = positionDefaults
                      .filter(pd => pd.position === position)
                      .map(pd => pd.role)
                      .filter((r): r is SystemRole => r !== undefined)
                    return (
                      <TableRow key={position}>
                        <TableCell className="font-medium">{position}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {rolesForPosition.map(role => (
                              <Badge key={role.id} variant="outline" className={getRoleColor(role.code)}>
                                {role.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {positionDefaults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        Маппинг должностей не настроен
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              <div className="mt-6 p-4 rounded-lg bg-secondary/30 border border-border">
                <h4 className="text-sm font-medium mb-2">Как это работает:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>1. Должность (position) - это HR/организационная роль сотрудника</li>
                  <li>2. RBAC роли - это права доступа в системе</li>
                  <li>3. При выборе должности в карточке сотрудника показываются рекомендуемые роли</li>
                  <li>4. Роли можно применить одной кнопкой или настроить вручную</li>
                </ul>
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
              
              {/* Вычисленный доступ к модулям (read-only, определяется ролями) */}
              <div className="space-y-2">
                <Label>Доступ к модулям (определяется ролями)</Label>
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-secondary/30">
                  {MODULES.map(mod => {
                    const Icon = mod.icon
                    const level = editingEmployee.computed_module_access?.[mod.id] || 'none'
                    const accessInfo = ACCESS_LEVELS.find(a => a.level === level)
                    return (
                      <div key={mod.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-sm">
                          <Icon className={`h-4 w-4 ${mod.color}`} />
                          {mod.label}
                        </div>
                        <Badge variant="outline" className={`text-xs ${accessInfo?.color}`}>
                          {accessInfo?.label}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Уровень доступа определяется автоматически на основе назначенных ролей RBAC
                </p>
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
              
              {/* Блок RBAC ролей - source of truth через employee_roles */}
              <div className="space-y-3 p-3 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Роли RBAC</Label>
                  {editingEmployee.auth_user_id && (
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Синхр. с Auth
                    </Badge>
                  )}
                </div>
                
                {/* Текущие роли с возможностью удаления */}
                <div className="flex flex-wrap gap-1">
                  {(editingEmployee.system_roles || []).length > 0 ? (
                    editingEmployee.system_roles!.map(role => (
                      <Badge key={role.id} variant="outline" className={`${getRoleColor(role.code)} pr-1`}>
                        {role.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 p-0 hover:bg-red-500/20"
                          onClick={() => removeRole(editingEmployee.id, role.id)}
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Нет назначенных ролей</span>
                  )}
                </div>
                
                {/* Роли по умолчанию для должности */}
                {editingEmployeeDefaultRoles.length > 0 && (
                  <div className="p-2 rounded bg-secondary/50 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Роли по умолчанию для должности "{editingEmployee.position || editingEmployee.job_title}":
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {editingEmployeeDefaultRoles.map(role => (
                        <Badge key={role.id} variant="outline" className="text-xs">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyDefaultRoles}
                      className="w-full mt-2 bg-transparent"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Применить роли по умолчанию
                    </Button>
                  </div>
                )}
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
