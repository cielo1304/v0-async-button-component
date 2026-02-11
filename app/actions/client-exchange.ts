'use server'

import { createServerClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'

// ==================== Types ====================

export interface ExchangeLine {
  currency: string
  amount: string
  cashboxId: string
}

export interface SubmitExchangeInput {
  clientGives: ExchangeLine[]
  clientReceives: ExchangeLine[]
  clientName?: string
  clientPhone?: string
  baseCurrency: string
  totalGivesBase: number
  totalReceivesBase: number
  profit: number
  actorEmployeeId: string
  rates: Array<{
    lineCurrency: string
    direction: 'give' | 'receive'
    appliedRate: number | null
    marketRate: number | null
    amountInBase: number | null
  }>
}

export interface ExchangeResult {
  success: boolean
  error?: string
  operationNumber?: string
  operationId?: string
}

// ==================== Submit Exchange ====================

export async function submitExchange(input: SubmitExchangeInput): Promise<ExchangeResult> {
  const supabase = await createServerClient()

  try {
    // 0. Create/find contact if client data provided
    let contactId: string | null = null
    if (input.clientName || input.clientPhone) {
      const { data: contactData } = await supabase.rpc('get_or_create_contact', {
        p_display_name: input.clientName || 'Клиент обмена',
        p_phone: input.clientPhone || null,
        p_email: null,
        p_module: 'exchange'
      })
      contactId = contactData
    }

    // 1. Create main operation
    const { data: operation, error: opError } = await supabase
      .from('client_exchange_operations')
      .insert({
        operation_number: '',
        total_client_gives_usd: input.totalGivesBase,
        total_client_receives_usd: input.totalReceivesBase,
        profit_amount: input.profit,
        profit_currency: input.baseCurrency,
        client_name: input.clientName || null,
        client_phone: input.clientPhone || null,
        contact_id: contactId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        created_by: input.actorEmployeeId,
        completed_by: input.actorEmployeeId,
        responsible_employee_id: input.actorEmployeeId,
      })
      .select()
      .single()

    if (opError) throw opError

    // 2. Process "gives" - client gives, we receive into cashbox
    for (const line of input.clientGives) {
      const amount = parseFloat(line.amount)
      if (!amount || !line.cashboxId) continue

      const rateInfo = input.rates.find(r => r.lineCurrency === line.currency && r.direction === 'give')

      await supabase.from('client_exchange_details').insert({
        operation_id: operation.id,
        direction: 'give',
        currency: line.currency,
        amount,
        applied_rate: rateInfo?.appliedRate || null,
        market_rate: rateInfo?.marketRate || null,
        cashbox_id: line.cashboxId,
        amount_in_base: rateInfo?.amountInBase || null,
      })

      // Atomic: update cashbox + insert transaction
      await supabase.rpc('cashbox_operation', {
        p_cashbox_id: line.cashboxId,
        p_amount: amount,
        p_category: 'CLIENT_EXCHANGE_IN',
        p_description: `Клиентский обмен ${operation.operation_number}: получено ${amount} ${line.currency}`,
        p_reference_id: operation.id,
        p_created_by: input.actorEmployeeId,
      })
    }

    // 3. Process "receives" - client receives, we give from cashbox
    for (const line of input.clientReceives) {
      const amount = parseFloat(line.amount)
      if (!amount || !line.cashboxId) continue

      const rateInfo = input.rates.find(r => r.lineCurrency === line.currency && r.direction === 'receive')

      await supabase.from('client_exchange_details').insert({
        operation_id: operation.id,
        direction: 'receive',
        currency: line.currency,
        amount,
        applied_rate: rateInfo?.appliedRate || null,
        market_rate: rateInfo?.marketRate || null,
        cashbox_id: line.cashboxId,
        amount_in_base: rateInfo?.amountInBase || null,
      })

      // Atomic: decrease cashbox + insert transaction
      await supabase.rpc('cashbox_operation', {
        p_cashbox_id: line.cashboxId,
        p_amount: -amount,
        p_category: 'CLIENT_EXCHANGE_OUT',
        p_description: `Клиентский обмен ${operation.operation_number}: выдано ${amount} ${line.currency}`,
        p_reference_id: operation.id,
        p_created_by: input.actorEmployeeId,
      })
    }

    // 4. Log contact event
    if (contactId) {
      await supabase.rpc('log_contact_event', {
        p_contact_id: contactId,
        p_module: 'exchange',
        p_entity_type: 'client_exchange_operation',
        p_entity_id: operation.id,
        p_title: `Обмен ${operation.operation_number}`,
        p_payload: {
          profit: input.profit,
          gives: input.clientGives.map(g => ({ currency: g.currency, amount: g.amount })),
          receives: input.clientReceives.map(r => ({ currency: r.currency, amount: r.amount })),
          operation_number: operation.operation_number,
        }
      })
    }

    // 5. Audit log
    await writeAuditLog(supabase, {
      actorEmployeeId: input.actorEmployeeId,
      action: 'exchange_submit',
      module: 'exchange',
      entityTable: 'client_exchange_operations',
      entityId: operation.id,
      after: {
        operation_number: operation.operation_number,
        profit: input.profit,
        gives: input.clientGives,
        receives: input.clientReceives,
      },
    })

    return {
      success: true,
      operationNumber: operation.operation_number,
      operationId: operation.id,
    }

  } catch (error: unknown) {
    console.error('[client-exchange] Submit error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  }
}

// ==================== Cancel Exchange ====================

export async function cancelExchange(operationId: string, actorEmployeeId: string, reason?: string): Promise<ExchangeResult> {
  const supabase = await createServerClient()

  try {
    // 1. Get operation with details
    const { data: operation, error: fetchErr } = await supabase
      .from('client_exchange_operations')
      .select('*, client_exchange_details(*)')
      .eq('id', operationId)
      .single()

    if (fetchErr || !operation) return { success: false, error: 'Операция не найдена' }
    if (operation.status === 'cancelled') return { success: false, error: 'Операция уже отменена' }

    // 2. Reverse all cashbox movements
    for (const detail of (operation.client_exchange_details || [])) {
      if (!detail.cashbox_id) continue
      const reverseAmount = detail.direction === 'give' ? -detail.amount : detail.amount

      await supabase.rpc('cashbox_operation', {
        p_cashbox_id: detail.cashbox_id,
        p_amount: reverseAmount,
        p_category: detail.direction === 'give' ? 'CLIENT_EXCHANGE_OUT' : 'CLIENT_EXCHANGE_IN',
        p_description: `Отмена обмена ${operation.operation_number}: возврат ${Math.abs(reverseAmount)} ${detail.currency}`,
        p_reference_id: operationId,
        p_created_by: actorEmployeeId,
      })
    }

    // 3. Mark operation cancelled
    await supabase
      .from('client_exchange_operations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: actorEmployeeId,
        cancelled_reason: reason || null,
      })
      .eq('id', operationId)

    // 4. Audit log
    await writeAuditLog(supabase, {
      actorEmployeeId,
      action: 'exchange_cancel',
      module: 'exchange',
      entityTable: 'client_exchange_operations',
      entityId: operationId,
      before: { status: operation.status },
      after: { status: 'cancelled', reason },
    })

    return { success: true, operationNumber: operation.operation_number }

  } catch (error: unknown) {
    console.error('[client-exchange] Cancel error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' }
  }
}
