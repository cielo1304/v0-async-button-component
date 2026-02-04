'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Shield, Plus, Trash2, Users, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { SystemRole, UserRole } from '@/lib/types/database'

interface UserWithRoles {
  id: string
  email: string
  roles: SystemRole[]
}

export function UserRolesManager() {
  const supabase = useMemo(() => createClient(), [])
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [roles, setRoles] = useState<SystemRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  
  const loadData = async () => {
    setIsLoading(true)
    try {
      // Загрузка ролей
      const { data: rolesData } = await supabase
        .from('system_roles')
        .select('*')
        .order('name')
      
      setRoles(rolesData || [])
      
      // Получаем текущего пользователя
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      
      // Загрузка пользователей с ролями
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role_id,
          system_roles (*)
        `)
      
      // Группируем по пользователям
      const usersMap = new Map<string, UserWithRoles>()
      
      // Добавляем текущего пользователя
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
      
      setUsers(Array.from(usersMap.values()))
    } catch {
      toast.error('Ошибка загрузки данных')
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadData()
  }, [])
  
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
      setIsDialogOpen(false)
      setSelectedUserId('')
      setSelectedRoleId('')
      loadData()
    } catch {
      toast.error('Ошибка назначения роли')
    }
  }
  
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
  
  const getRoleColor = (code: string) => {
    switch (code) {
      case 'ADMIN': return 'bg-red-500/20 text-red-400'
      case 'MANAGER': return 'bg-blue-500/20 text-blue-400'
      case 'ACCOUNTANT': return 'bg-emerald-500/20 text-emerald-400'
      case 'CASHIER': return 'bg-amber-500/20 text-amber-400'
      default: return 'bg-zinc-500/20 text-zinc-400'
    }
  }
  
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-cyan-400" />
            Управление ролями
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} className="bg-transparent">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Назначить роль
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Назначить роль пользователю</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Пользователь</label>
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
                    <label className="text-sm font-medium">Роль</label>
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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Роли</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
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
                        <Badge key={role.id} className={getRoleColor(role.code)}>
                          {role.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">Нет ролей</span>
                    )}
                  </div>
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
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
                <Badge className={getRoleColor(role.code)}>{role.code}</Badge>
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
  )
}
