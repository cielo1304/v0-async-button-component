/**
 * Модуль контроля доступа (RBAC scaffolding)
 * 
 * По умолчанию работает в режиме "Глаз Бога" (ACCESS_ENABLED=false).
 * Когда ACCESS_ENABLED=true, права загружаются из ролей пользователя.
 * 
 * Флаг: NEXT_PUBLIC_ACCESS_CONTROL_ENABLED
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContactModule } from '@/lib/types/database'
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
