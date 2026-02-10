/**
 * Модуль контроля доступа (RBAC scaffolding)
 * 
 * По умолчанию работает в режиме "Глаз Бога" (ACCESS_ENABLED=false).
 * Когда ACCESS_ENABLED=true, права загружаются из ролей пользователя.
 * 
 * Флаг: NEXT_PUBLIC_ACCESS_CONTROL_ENABLED
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { 
  ContactModule, 
  BusinessModule, 
  ModuleAccessLevel,
  ModuleAccess,
  ModuleVisibility,
  Employee,
  SystemRole,
  EmployeeAccessResult 
} from '@/lib/types/database'
import { CONTACT_PERMISSIONS } from '@/lib/constants/contacts'

// Feature flag: режим "Глаз Бога" по умолчанию
const ACCESS_ENABLED = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ENABLED === 'true'

export type Permission = string

// Специальное право, означающее "полный доступ"
const GOD_MODE_PERMISSION = '*'

/**
 * Получить права текущего пользователя
 * @param supabase - клиент Supabase
 * @returns Set<Permission> - набор прав
 */
export async function getCurrentUserPermissions(
  supabase: SupabaseClient
): Promise<Set<Permission>> {
  // Режим "Глаз Бога" - полный доступ
  if (!ACCESS_ENABLED) {
    return new Set([GOD_MODE_PERMISSION])
  }

  try {
    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.warn('Access: No authenticated user')
      return new Set()
    }

    const permissions = new Set<Permission>()

    // Загружаем роли из system_roles через user_roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        role_id,
        system_roles (
          permissions
        )
      `)
      .eq('user_id', user.id)

    if (!rolesError && userRoles) {
      for (const ur of userRoles) {
        const role = ur.system_roles as { permissions: string[] } | null
        if (role?.permissions) {
          for (const p of role.permissions) {
            permissions.add(p)
          }
        }
      }
    }

    // Также загружаем роли из auto_user_roles (если есть)
    const { data: autoUserRoles, error: autoError } = await supabase
      .from('auto_user_roles')
      .select(`
        role_id,
        auto_roles (
          permissions
        )
      `)
      .eq('user_id', user.id)

    if (!autoError && autoUserRoles) {
      for (const aur of autoUserRoles) {
        const role = aur.auto_roles as { permissions: string[] } | null
        if (role?.permissions) {
          for (const p of role.permissions) {
            permissions.add(p)
          }
        }
      }
    }

    return permissions
  } catch (error) {
    console.error('Access: Error loading permissions', error)
    return new Set()
  }
}

/**
 * Проверить, имеет ли пользователь право на чтение модуля контактов
 */
export function canReadModule(perms: Set<Permission>, module: ContactModule): boolean {
  // Режим "Глаз Бога"
  if (perms.has(GOD_MODE_PERMISSION)) {
    return true
  }

  // Проверяем конкретное право на модуль
  const permissionMap: Record<ContactModule, string> = {
    exchange: CONTACT_PERMISSIONS.SEGMENT_EXCHANGE_READ,
    deals: CONTACT_PERMISSIONS.SEGMENT_DEALS_READ,
    auto: CONTACT_PERMISSIONS.SEGMENT_AUTO_READ,
  }

  return perms.has(permissionMap[module]) || perms.has(CONTACT_PERMISSIONS.READ)
}

/**
 * Проверить, имеет ли пользователь право на запись контактов
 */
export function canWriteContacts(perms: Set<Permission>): boolean {
  if (perms.has(GOD_MODE_PERMISSION)) {
    return true
  }
  return perms.has(CONTACT_PERMISSIONS.WRITE)
}

/**
 * Проверить, имеет ли пользователь право на чтение чувствительных данных
 */
export function canReadSensitive(perms: Set<Permission>): boolean {
  if (perms.has(GOD_MODE_PERMISSION)) {
    return true
  }
  return perms.has(CONTACT_PERMISSIONS.SENSITIVE_READ)
}

/**
 * Получить список модулей, доступных пользователю
 */
export function getAccessibleModules(perms: Set<Permission>): ContactModule[] {
  const modules: ContactModule[] = ['exchange', 'deals', 'auto']
  return modules.filter(m => canReadModule(perms, m))
}

/**
 * Хелпер: проверить включен ли режим контроля доступа
 */
export function isAccessControlEnabled(): boolean {
  return ACCESS_ENABLED
}

/**
 * Хелпер: проверить, находимся ли в режиме "Глаз Бога"
 */
export function isGodMode(perms: Set<Permission>): boolean {
  return perms.has(GOD_MODE_PERMISSION)
}

// ================================================
// TEAM ACCESS MODULE - Employee-centric RBAC
// ================================================

// Уровни доступа по приоритету
const ACCESS_LEVELS: ModuleAccessLevel[] = ['none', 'view', 'work', 'manage']

/**
 * Сравнить уровни доступа
 * @returns true если actualLevel >= requiredLevel
 */
export function hasAccessLevel(
  actualLevel: ModuleAccessLevel | undefined,
  requiredLevel: ModuleAccessLevel
): boolean {
  if (!actualLevel || actualLevel === 'none') return requiredLevel === 'none'
  const actualIdx = ACCESS_LEVELS.indexOf(actualLevel)
  const requiredIdx = ACCESS_LEVELS.indexOf(requiredLevel)
  return actualIdx >= requiredIdx
}

/**
 * Получить доступы текущего сотрудника через auth.users
 * Source of truth: employee_roles + employees.module_access
 * 
 * @param supabase - клиент Supabase
 * @param authUserId - опционально, если уже известен user.id
 * @returns EmployeeAccessResult
 */
export async function getCurrentEmployeeAccess(
  supabase: SupabaseClient,
  authUserId?: string
): Promise<EmployeeAccessResult> {
  // Дефолтный результат для режима "Глаз Бога"
  const godModeResult: EmployeeAccessResult = {
    employee: null,
    roles: [],
    permissions: [GOD_MODE_PERMISSION],
    moduleAccess: { exchange: 'manage', auto: 'manage', deals: 'manage', stock: 'manage', assets: 'manage', finance: 'manage' },
    moduleVisibility: {
      exchange: { scope: 'all' },
      auto: { scope: 'all' },
      deals: { scope: 'all' },
      stock: { scope: 'all' },
      assets: { scope: 'all' },
      finance: { scope: 'all' }
    },
    isAdmin: true,
    hasPermission: () => true,
    canAccessModule: () => true
  }

  // Режим "Глаз Бога" - полный доступ
  if (!ACCESS_ENABLED) {
    return godModeResult
  }

  try {
    // Получаем auth user id
    let userId = authUserId
    if (!userId) {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.warn('Access: No authenticated user')
        return createEmptyAccessResult()
      }
      userId = user.id
    }

    // Ищем сотрудника по auth_user_id
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', userId)
      .eq('is_active', true)
      .single()

    if (empError || !employee) {
      console.warn('Access: No active employee for auth user', userId)
      return createEmptyAccessResult()
    }

    // Загружаем роли из employee_roles (source of truth)
    const { data: employeeRoles, error: rolesError } = await supabase
      .from('employee_roles')
      .select(`
        id,
        role_id,
        assigned_at,
        system_roles (*)
      `)
      .eq('employee_id', employee.id)

    const roles: SystemRole[] = []
    const permissions = new Set<string>()

    if (!rolesError && employeeRoles) {
      for (const er of employeeRoles) {
        const role = er.system_roles as SystemRole | null
        if (role) {
          roles.push(role)
          if (role.permissions) {
            for (const p of role.permissions) {
              permissions.add(p)
            }
          }
        }
      }
    }

    // Парсим module_access из employees
    const moduleAccess: ModuleAccess = (employee.module_access as ModuleAccess) || {}
    const moduleVisibility: ModuleVisibility = (employee.module_visibility as ModuleVisibility) || {
      exchange: { scope: 'all' },
      auto: { scope: 'all' },
      deals: { scope: 'all' },
      stock: { scope: 'all' }
    }

    // Проверяем админские права
    const isAdmin = permissions.has(GOD_MODE_PERMISSION) || 
      roles.some(r => r.code === 'ADMIN')

    // Создаем функции проверки
    const hasPermission = (permission: string): boolean => {
      if (isAdmin || permissions.has(GOD_MODE_PERMISSION)) return true
      return permissions.has(permission)
    }

    const canAccessModule = (
      module: BusinessModule, 
      requiredLevel: ModuleAccessLevel = 'view'
    ): boolean => {
      if (isAdmin) return true
      const level = moduleAccess[module]
      return hasAccessLevel(level, requiredLevel)
    }

    return {
      employee: employee as Employee,
      roles,
      permissions: Array.from(permissions),
      moduleAccess,
      moduleVisibility,
      isAdmin,
      hasPermission,
      canAccessModule
    }
  } catch (error) {
    console.error('Access: Error loading employee access', error)
    return createEmptyAccessResult()
  }
}

/**
 * Создать пустой результат доступа (для неавторизованных)
 */
function createEmptyAccessResult(): EmployeeAccessResult {
  return {
    employee: null,
    roles: [],
    permissions: [],
    moduleAccess: {},
    moduleVisibility: {},
    isAdmin: false,
    hasPermission: () => false,
    canAccessModule: () => false
  }
}

/**
 * Получить все preset роли для модуля
 */
export function getModulePresetRoles(
  roles: SystemRole[],
  module: BusinessModule
): { view?: SystemRole; work?: SystemRole; manage?: SystemRole } {
  const result: { view?: SystemRole; work?: SystemRole; manage?: SystemRole } = {}
  
  const moduleUpper = module.toUpperCase()
  for (const role of roles) {
    if (role.module === module || role.code?.startsWith(moduleUpper)) {
      if (role.code?.endsWith('_VIEW')) result.view = role
      else if (role.code?.endsWith('_WORK')) result.work = role
      else if (role.code?.endsWith('_MANAGE')) result.manage = role
    }
  }
  
  return result
}

/**
 * Определить уровень доступа к модулю по назначенным ролям
 */
export function getModuleAccessLevelFromRoles(
  assignedRoles: SystemRole[],
  module: BusinessModule
): ModuleAccessLevel {
  const moduleUpper = module.toUpperCase()
  
  for (const role of assignedRoles) {
    // ADMIN имеет полный доступ ко всему
    if (role.code === 'ADMIN') return 'manage'
    
    // Проверяем роли модуля
    if (role.code?.startsWith(moduleUpper)) {
      if (role.code.endsWith('_MANAGE')) return 'manage'
      if (role.code.endsWith('_WORK')) return 'work'
      if (role.code.endsWith('_VIEW')) return 'view'
    }
  }
  
  return 'none'
}

/**
 * Проверить видимость строки по RBAC
 * God mode: всегда true (но данные visibility сохраняем)
 * public: видно всем
 * restricted: видно если роли пользователя пересекаются с allowed_role_codes
 */
export function canViewByVisibility(
  permsOrRoleCodes: Set<Permission> | string[],
  row: { visibility_mode?: string; allowed_role_codes?: string[] }
): boolean {
  // God mode
  if (permsOrRoleCodes instanceof Set && permsOrRoleCodes.has(GOD_MODE_PERMISSION)) {
    return true
  }
  if (!ACCESS_ENABLED) return true
  
  // Public = everyone can see
  if (!row.visibility_mode || row.visibility_mode === 'public') return true
  
  // Restricted = check role codes intersection
  const allowedCodes = row.allowed_role_codes || []
  if (allowedCodes.length === 0) return true // no restriction specified
  
  const userCodes = permsOrRoleCodes instanceof Set 
    ? Array.from(permsOrRoleCodes) 
    : permsOrRoleCodes
  
  return allowedCodes.some(code => userCodes.includes(code))
}

/**
 * Проверить доступ к модулю assets
 */
export function canReadAssets(perms: Set<Permission>): boolean {
  if (perms.has(GOD_MODE_PERMISSION)) return true
  return perms.has('assets.read')
}

/**
 * Проверить доступ к модулю finance
 */
export function canReadFinance(perms: Set<Permission>): boolean {
  if (perms.has(GOD_MODE_PERMISSION)) return true
  return perms.has('finance.read')
}
