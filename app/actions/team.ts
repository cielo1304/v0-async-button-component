'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/require-user'
import { revalidatePath } from 'next/cache'
import type { BusinessModule, ModuleAccessLevel, ModuleAccess, VisibilityScope } from '@/lib/types/database'
import { PRESET_ROLE_CODE_BY_MODULE_LEVEL, ALL_MODULE_PRESET_ROLE_CODES } from '@/lib/constants/team-access'

// ================================================
// Employee CRUD
// ================================================

export async function createEmployee(data: {
  full_name: string
  position?: string
  phone?: string
  email?: string
  hired_at?: string
  notes?: string
}) {
  const supabase = await createClient()
  
  const { data: employee, error } = await supabase
    .from('employees')
    .insert({
      full_name: data.full_name,
      position: data.position || null,
      phone: data.phone || null,
      email: data.email || null,
      hired_at: data.hired_at || new Date().toISOString(),
      notes: data.notes || null,
      is_active: true,
      modules: [],
      module_access: {},
      module_visibility: {
        exchange: { scope: 'all' },
        auto: { scope: 'all' },
        deals: { scope: 'all' },
        stock: { scope: 'all' }
      }
    })
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
  return employee
}

export async function updateEmployee(
  employeeId: string,
  data: {
    full_name?: string
    position?: string
    phone?: string
    email?: string
    hired_at?: string
    notes?: string
    is_active?: boolean
  }
) {
  const supabase = await createClient()
  
  const { data: employee, error } = await supabase
    .from('employees')
    .update(data)
    .eq('id', employeeId)
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
  return employee
}

export async function deactivateEmployee(employeeId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', employeeId)
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
}

// ================================================
// Module Access (B3)
// ================================================

/**
 * Установить уровень доступа к модулю для сотрудника
 * При изменении уровня:
 * - Обновляет employees.module_access
 * - Удаляет старые preset роли этого модуля из employee_roles
 * - Добавляет новую preset роль (если level != 'none')
 * - Синхронизирует employees.modules[] для совместимости
 */
export async function setEmployeeModuleAccess(
  employeeId: string,
  module: BusinessModule,
  level: ModuleAccessLevel
) {
  const supabase = await createClient()
  
  // 1. Получаем текущие данные сотрудника
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('module_access, modules')
    .eq('id', employeeId)
    .single()
  
  if (fetchError) throw new Error(fetchError.message)
  
  // 2. Обновляем module_access
  const currentAccess = (employee.module_access as ModuleAccess) || {}
  const newAccess = { ...currentAccess, [module]: level }
  
  // 3. Обновляем modules[] для совместимости (включаем если level >= 'work')
  const currentModules = (employee.modules as string[]) || []
  let newModules = [...currentModules]
  if (level === 'work' || level === 'manage') {
    if (!newModules.includes(module)) {
      newModules.push(module)
    }
  } else {
    newModules = newModules.filter(m => m !== module)
  }
  
  // 4. Сохраняем в employees
  const { error: updateError } = await supabase
    .from('employees')
    .update({
      module_access: newAccess,
      modules: newModules
    })
    .eq('id', employeeId)
  
  if (updateError) throw new Error(updateError.message)
  
  // 5. Получаем все preset роли
  const moduleRoleCodes = [
    `${module.toUpperCase()}_VIEW`,
    `${module.toUpperCase()}_WORK`,
    `${module.toUpperCase()}_MANAGE`
  ]
  
  const { data: presetRoles } = await supabase
    .from('system_roles')
    .select('id, code')
    .in('code', moduleRoleCodes)
  
  if (!presetRoles) {
    revalidatePath('/settings')
    return
  }
  
  const presetRoleIds = presetRoles.map(r => r.id)
  
  // 6. Удаляем все preset роли этого модуля у сотрудника
  await supabase
    .from('employee_roles')
    .delete()
    .eq('employee_id', employeeId)
    .in('role_id', presetRoleIds)
  
  // 7. Если level != 'none', добавляем нужную роль
  if (level !== 'none') {
    const targetRoleCode = PRESET_ROLE_CODE_BY_MODULE_LEVEL[module][level as Exclude<ModuleAccessLevel, 'none'>]
    const targetRole = presetRoles.find(r => r.code === targetRoleCode)
    
    if (targetRole) {
      await supabase
        .from('employee_roles')
        .insert({
          employee_id: employeeId,
          role_id: targetRole.id
        })
    }
  }
  
  revalidatePath('/settings')
}

/**
 * Установить видимость данных для модуля (на будущее)
 */
export async function setEmployeeModuleVisibility(
  employeeId: string,
  module: BusinessModule,
  scope: VisibilityScope
) {
  const supabase = await createClient()
  
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('module_visibility')
    .eq('id', employeeId)
    .single()
  
  if (fetchError) throw new Error(fetchError.message)
  
  const currentVisibility = employee.module_visibility || {}
  const newVisibility = {
    ...currentVisibility,
    [module]: { scope }
  }
  
  const { error } = await supabase
    .from('employees')
    .update({ module_visibility: newVisibility })
    .eq('id', employeeId)
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
}

// ================================================
// Employee Roles (RBAC)
// ================================================

export async function addEmployeeRole(employeeId: string, roleId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('employee_roles')
    .insert({
      employee_id: employeeId,
      role_id: roleId
    })
  
  if (error) {
    if (error.code === '23505') {
      throw new Error('У сотрудника уже есть эта роль')
    }
    throw new Error(error.message)
  }
  
  revalidatePath('/settings')
}

export async function removeEmployeeRole(employeeId: string, roleId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('employee_roles')
    .delete()
    .eq('employee_id', employeeId)
    .eq('role_id', roleId)
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
}

/**
 * Применить роли по умолчанию для должности сотрудника
 * Добавляет недостающие роли, не удаляя существующие
 */
export async function applyPositionDefaultRoles(employeeId: string) {
  const supabase = await createClient()
  
  // Получаем должность сотрудника
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('position')
    .eq('id', employeeId)
    .single()
  
  if (empError || !employee?.position) {
    throw new Error('Должность не указана')
  }
  
  // Получаем роли по умолчанию для должности
  const { data: defaults } = await supabase
    .from('position_default_roles')
    .select('system_role_id')
    .eq('position', employee.position)
  
  if (!defaults || defaults.length === 0) return
  
  // Получаем текущие роли сотрудника
  const { data: currentRoles } = await supabase
    .from('employee_roles')
    .select('role_id')
    .eq('employee_id', employeeId)
  
  const currentRoleIds = new Set(currentRoles?.map(r => r.role_id) || [])
  
  // Добавляем недостающие роли
  const rolesToAdd = defaults
    .filter(d => !currentRoleIds.has(d.system_role_id))
    .map(d => ({
      employee_id: employeeId,
      role_id: d.system_role_id
    }))
  
  if (rolesToAdd.length > 0) {
    const { error } = await supabase
      .from('employee_roles')
      .insert(rolesToAdd)
    
    if (error) throw new Error(error.message)
  }
  
  revalidatePath('/settings')
  return rolesToAdd.length
}

// ================================================
// Employee Invites
// ================================================

export async function createEmployeeInvite(employeeId: string, email: string) {
  const supabase = await createClient()
  
  if (!email) {
    throw new Error('Email не указан')
  }
  
  // Отменяем предыдущие активные инвайты
  await supabase
    .from('employee_invites')
    .update({ status: 'cancelled' })
    .eq('employee_id', employeeId)
    .eq('status', 'sent')
  
  // Создаем новый инвайт
  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 дней
  
  const { data: invite, error } = await supabase
    .from('employee_invites')
    .insert({
      employee_id: employeeId,
      email: email,
      status: 'sent',
      token: token,
      expires_at: expiresAt.toISOString()
    })
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  
  // TODO: Отправить email с приглашением
  // await sendInviteEmail(email, token)
  
  revalidatePath('/settings')
  return invite
}

/**
 * Синхронизировать роли сотрудника в user_roles (если auth_user_id есть)
 * Вызывает SQL функцию sync_employee_roles_to_user_roles
 */
export async function syncEmployeeRoles(employeeId: string) {
  const supabase = await createClient()
  
  // Проверяем что у сотрудника есть auth_user_id
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('auth_user_id')
    .eq('id', employeeId)
    .single()
  
  if (empError) throw new Error(empError.message)
  
  if (!employee.auth_user_id) {
    throw new Error('Сотрудник не привязан к пользователю Auth')
  }
  
  // Вызываем SQL функцию синхронизации
  const { error } = await supabase.rpc('sync_employee_roles_to_user_roles', {
    p_employee_id: employeeId
  })
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
}

// ================================================
// Position Default Roles
// ================================================

export async function setPositionDefaultRoles(position: string, roleIds: string[]) {
  const supabase = await createClient()
  
  // Удаляем старые записи
  await supabase
    .from('position_default_roles')
    .delete()
    .eq('position', position)
  
  // Добавляем новые
  if (roleIds.length > 0) {
    const { error } = await supabase
      .from('position_default_roles')
      .insert(
        roleIds.map(roleId => ({
          position: position,
          system_role_id: roleId
        }))
      )
    
    if (error) throw new Error(error.message)
  }
  
  revalidatePath('/settings')
}

export async function deletePositionDefaultRoles(position: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('position_default_roles')
    .delete()
    .eq('position', position)
  
  if (error) throw new Error(error.message)
  
  revalidatePath('/settings')
}
