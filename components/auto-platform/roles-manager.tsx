'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Shield, UserPlus, X, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Role {
  id: string
  code: string
  name: string
  description: string | null
  permissions: string[]
}

interface UserRole {
  id: string
  user_id: string
  role_id: string
  assigned_at: string
  auto_roles: Role
  employees?: {
    id: string
    name: string
    position: string
  }
}

const ROLE_COLORS: Record<string, string> = {
  AUTO_ADMIN: 'bg-red-500/20 text-red-400 border-red-500/30',
  AUTO_SELLER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  AUTO_APPRAISER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  AUTO_MANAGER: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

export function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([])
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string; position: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [rolesRes, userRolesRes, employeesRes] = await Promise.all([
        supabase.from('auto_roles').select('*'),
        supabase.from('auto_user_roles').select(`
          *,
          auto_roles (*),
          employees:user_id (id, name, position)
        `),
        supabase.from('employees').select('id, name, position').eq('is_active', true),
      ])

      setRoles(rolesRes.data || [])
      setUserRoles(userRolesRes.data || [])
      setEmployees(employeesRes.data || [])
    } catch (error) {
      console.error('Error loading roles data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAssignRole = async () => {
    if (!selectedEmployee || !selectedRole) return
    
    setIsAssigning(true)
    try {
      const { error } = await supabase.from('auto_user_roles').insert({
        user_id: selectedEmployee,
        role_id: selectedRole,
      })

      if (error) throw error

      loadData()
      setShowDialog(false)
      setSelectedEmployee('')
      setSelectedRole('')
    } catch (error) {
      console.error('Error assigning role:', error)
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemoveRole = async (userRoleId: string) => {
    if (!confirm('Удалить роль у пользователя?')) return

    try {
      await supabase.from('auto_user_roles').delete().eq('id', userRoleId)
      setUserRoles(userRoles.filter(ur => ur.id !== userRoleId))
    } catch (error) {
      console.error('Error removing role:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Роли системы */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Роли автоплощадки
          </CardTitle>
          <CardDescription>Доступные роли и их права</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map(role => (
              <div
                key={role.id}
                className={`p-4 rounded-lg border ${ROLE_COLORS[role.code] || 'bg-secondary/50 border-border'}`}
              >
                <h3 className="font-semibold">{role.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                <div className="flex flex-wrap gap-1 mt-3">
                  {role.permissions.slice(0, 4).map((perm, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                  {role.permissions.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{role.permissions.length - 4}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Назначенные роли */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Users className="h-5 w-5" />
              Пользователи с ролями
            </CardTitle>
            <CardDescription>Назначенные роли сотрудникам</CardDescription>
          </div>
          
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Назначить роль
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Назначить роль</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Сотрудник</span>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name} ({emp.position})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">Роль</span>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите роль" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleAssignRole}
                  disabled={!selectedEmployee || !selectedRole || isAssigning}
                  className="w-full"
                >
                  {isAssigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Назначить
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {userRoles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Роли еще не назначены
            </p>
          ) : (
            <div className="space-y-2">
              {userRoles.map(ur => (
                <div
                  key={ur.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {ur.employees?.name || 'Пользователь'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ur.employees?.position}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={ROLE_COLORS[ur.auto_roles?.code] || ''}>
                      {ur.auto_roles?.name}
                    </Badge>
                    <button
                      onClick={() => handleRemoveRole(ur.id)}
                      className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
