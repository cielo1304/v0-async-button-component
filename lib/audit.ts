/**
 * Audit log helpers with impersonation support.
 * 
 * When in impersonation (View-As) mode, audit logs preserve BOTH:
 * - real_actor: The platform admin who initiated the action
 * - effective_actor: The employee identity being viewed as
 * 
 * Audit functions:
 * - writeAuditLog  -> audit_log_v2 (legacy, module-scoped)
 * - logAudit       -> audit_log   (new, table-level with diff)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditModule } from '@/lib/types/database'
import { getViewAsSession } from '@/lib/view-as'

/**
 * Get impersonation context for audit logging.
 * Returns both real actor and effective actor when in impersonation mode.
 */
export async function getAuditImpersonationContext(): Promise<{
  isImpersonation: boolean
  realActorUserId?: string
  effectiveEmployeeId?: string
  effectiveCompanyId?: string
}> {
  const session = await getViewAsSession()
  if (!session) {
    return { isImpersonation: false }
  }
  return {
    isImpersonation: true,
    realActorUserId: session.realActorUserId,
    effectiveEmployeeId: session.effectiveEmployeeId,
    effectiveCompanyId: session.effectiveCompanyId,
  }
}

// ==================== audit_log_v2 (legacy) ====================

interface AuditLogParams {
  actorEmployeeId?: string | null
  action: string
  module: AuditModule
  entityTable: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  // Impersonation fields (optional, auto-populated if in impersonation mode)
  realActorUserId?: string | null
  isImpersonation?: boolean
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: AuditLogParams
) {
  try {
    // Get impersonation context
    const impersonationCtx = await getAuditImpersonationContext()
    
    // Build audit entry with impersonation metadata
    const auditEntry: Record<string, unknown> = {
      actor_employee_id: params.actorEmployeeId || null,
      action: params.action,
      module: params.module,
      entity_table: params.entityTable,
      entity_id: params.entityId,
      before: params.before || null,
      after: params.after || null,
    }

    // If in impersonation mode, add context to the `after` metadata
    // This preserves both identities without requiring schema changes
    if (impersonationCtx.isImpersonation) {
      const afterWithContext = {
        ...(params.after || {}),
        __impersonation__: {
          real_actor_user_id: impersonationCtx.realActorUserId,
          effective_employee_id: impersonationCtx.effectiveEmployeeId,
          effective_company_id: impersonationCtx.effectiveCompanyId,
        }
      }
      auditEntry.after = afterWithContext
    }

    const { error } = await supabase.from('audit_log_v2').insert(auditEntry)
    if (error) {
      console.error('[audit] Failed to write audit log v2:', error.message)
    }
  } catch (e) {
    console.error('[audit] Unexpected error writing audit log v2:', e)
  }
}

// ==================== audit_log (new, table-level) ====================

interface LogAuditParams {
  table_name: string
  record_id?: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data?: Record<string, unknown> | null
  new_data?: Record<string, unknown> | null
  changed_by?: string | null
}

/**
 * Записывает событие в журнал аудита (audit_log).
 * Можно вызывать из клиентских компонентов, передавая supabase клиент.
 * Аудит никогда не блокирует основную операцию.
 * 
 * При работе в режиме просмотра (View-As) автоматически добавляет
 * контекст имперсонации в new_data для сохранения обоих идентификаторов.
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: LogAuditParams
) {
  try {
    // Get impersonation context
    const impersonationCtx = await getAuditImpersonationContext()
    
    // Build new_data with impersonation context if active
    let finalNewData = params.new_data || null
    if (impersonationCtx.isImpersonation && finalNewData) {
      finalNewData = {
        ...finalNewData,
        __impersonation__: {
          real_actor_user_id: impersonationCtx.realActorUserId,
          effective_employee_id: impersonationCtx.effectiveEmployeeId,
          effective_company_id: impersonationCtx.effectiveCompanyId,
        }
      }
    }
    
    await supabase.from('audit_log').insert({
      table_name: params.table_name,
      record_id: params.record_id || null,
      action: params.action,
      old_data: params.old_data || null,
      new_data: finalNewData,
      changed_by: params.changed_by || null,
    })
  } catch (err) {
    console.warn('[audit] Failed to log:', err)
  }
}

/**
 * Оборачивает операцию, автоматически логируя изменения в audit_log.
 */
export async function withAudit<T>(
  supabase: SupabaseClient,
  tableName: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  recordId: string | undefined,
  operation: () => Promise<T>,
  options?: {
    old_data?: Record<string, unknown> | null
    new_data?: Record<string, unknown> | null
    changed_by?: string
  }
): Promise<T> {
  const result = await operation()
  await logAudit(supabase, {
    table_name: tableName,
    record_id: recordId,
    action,
    old_data: options?.old_data,
    new_data: options?.new_data,
    changed_by: options?.changed_by,
  })
  return result
}
