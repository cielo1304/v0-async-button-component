/**
 * Audit log helpers.
 * - writeAuditLog  -> audit_log_v2 (legacy, module-scoped)
 * - logAudit       -> audit_log   (new, table-level with diff)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditModule } from '@/lib/types/database'

// ==================== audit_log_v2 (legacy) ====================

interface AuditLogParams {
  actorEmployeeId?: string | null
  action: string
  module: AuditModule
  entityTable: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: AuditLogParams
) {
  try {
    const { error } = await supabase.from('audit_log_v2').insert({
      actor_employee_id: params.actorEmployeeId || null,
      action: params.action,
      module: params.module,
      entity_table: params.entityTable,
      entity_id: params.entityId,
      before: params.before || null,
      after: params.after || null,
    })
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
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: LogAuditParams
) {
  try {
    await supabase.from('audit_log').insert({
      table_name: params.table_name,
      record_id: params.record_id || null,
      action: params.action,
      old_data: params.old_data || null,
      new_data: params.new_data || null,
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
