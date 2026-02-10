/**
 * Audit log helper: writes entries to audit_log_v2
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditModule } from '@/lib/types/database'

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
      console.error('[audit] Failed to write audit log:', error.message)
    }
  } catch (e) {
    console.error('[audit] Unexpected error writing audit log:', e)
  }
}
