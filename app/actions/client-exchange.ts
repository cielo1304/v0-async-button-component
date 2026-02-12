'use server'

import { createServerClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'

// ==================== STEP 9: Categories from DB ====================

let _cachedCategories: { in: string; out: string } | null = null

async function getExchangeCategories(): Promise<{ in: string; out: string }> {
  if (_cachedCategories) return _cachedCategories

  const supabase = await createServerClient()
  
  const { data: categories } = await supabase
    .from('cashbox_transaction_categories')
    .select('code')
    .in('code', ['CLIENT_EXCHANGE_IN', 'CLIENT_EXCHANGE_OUT'])

  const hasIn = categories?.some(c => c.code === 'CLIENT_EXCHANGE_IN')
  const hasOut = categories?.some(c => c.code === 'CLIENT_EXCHANGE_OUT')

  _cachedCategories = {
    in: hasIn ? 'CLIENT_EXCHANGE_IN' : 'DEPOSIT',
    out: hasOut ? 'CLIENT_EXCHANGE_OUT' : 'WITHDRAWAL',
  }

  return _cachedCategories
}

// ==================== Types ====================

export interface ExchangeLine {
  currency: string
  amount: string
  cashboxId: string
}

export interface ExchangeParticipant {
  contactId?: string
  contactName?: string   // For auto-create
  contactPhone?: string  // For auto-create
  role: 'client' | 'beneficiary' | 'courier' | 'representative'
  note?: string
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
  // New fields
  participants?: ExchangeParticipant[]
  beneficiaryContactId?: string
  handoverContactId?: string
  followupAt?: string      // ISO date
  followupNote?: string
  visibilityMode?: 'public' | 'restricted'
  allowedRoleCodes?: string[]
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
    // STEP 9: Get categories from DB
    const categories = await getExchangeCategories()
    // -1. Validate beneficiary rule: if >1 client-side participant => beneficiary required
    const clientParticipants = (input.participants || []).filter(p =>
      p.role === 'client' || p.role === 'beneficiary' || p.role === 'representative'
    )
    if (clientParticipants.length > 1 && !input.beneficiaryContactId) {
      return { success: false, error: 'При наличии 2+ участников со стороны клиента необходимо указать бенефициара' }
    }

    // 0. Validate rates: all lines must have applied_rate (if not base currency)
    for (const r of input.rates) {
      if (r.lineCurrency !== input.baseCurrency && r.appliedRate == null) {
        return { success: false, error: `Не найден курс для ${r.lineCurrency}. Укажите курс вручную.` }
      }
    }

    // 0.5 Create/find contact if client data provided
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

    // 0.6 Build rates snapshot
    const ratesSnapshot = {
      baseCurrency: input.baseCurrency,
      rates: input.rates,
      capturedAt: new Date().toISOString(),
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
        beneficiary_contact_id: input.beneficiaryContactId || null,
        handover_contact_id: input.handoverContactId || null,
        followup_at: input.followupAt || null,
        followup_note: input.followupNote || null,
        rates_snapshot: ratesSnapshot,
        visibility_mode: input.visibilityMode || 'public',
        allowed_role_codes: input.allowedRoleCodes || [],
        status: 'completed',
        completed_at: new Date().toISOString(),
        created_by: input.actorEmployeeId,
        completed_by: input.actorEmployeeId,
        responsible_employee_id: input.actorEmployeeId,
      })
      .select()
      .single()

    if (opError) throw opError

    // 1.5 Insert participants
    if (input.participants && input.participants.length > 0) {
      for (const p of input.participants) {
        let pContactId = p.contactId || null
        // Auto-create contact if name provided but no contactId
        if (!pContactId && p.contactName) {
          const { data: newContact } = await supabase.rpc('get_or_create_contact', {
            p_display_name: p.contactName,
            p_phone: p.contactPhone || null,
            p_email: null,
            p_module: 'exchange'
          })
          pContactId = newContact
        }
        if (pContactId) {
          await supabase.from('client_exchange_participants').insert({
            operation_id: operation.id,
            contact_id: pContactId,
            role: p.role,
            note: p.note || null,
          })
        }
      }
    }

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
        p_category: categories.in,
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
        p_category: categories.out,
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

// ==================== Follow-up ====================

export async function setFollowup(
  operationId: string,
  followupAt: string,
  followupNote: string,
  actorEmployeeId: string,
): Promise<ExchangeResult> {
  const supabase = await createServerClient()
  try {
    const { error } = await supabase
      .from('client_exchange_operations')
      .update({
        followup_at: followupAt,
        followup_note: followupNote || null,
      })
      .eq('id', operationId)

    if (error) throw error

    await writeAuditLog(supabase, {
      actorEmployeeId,
      action: 'exchange_followup',
      module: 'exchange',
      entityTable: 'client_exchange_operations',
      entityId: operationId,
      after: { followup_at: followupAt, followup_note: followupNote },
    })

    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка' }
  }
}

// ==================== Cancel Exchange ====================

export async function cancelExchange(operationId: string, actorEmployeeId: string, reason?: string): Promise<ExchangeResult> {
  const supabase = await createServerClient()

  try {
    // STEP 9: Get categories from DB
    const categories = await getExchangeCategories()
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
        p_category: detail.direction === 'give' ? categories.out : categories.in,
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
