'use server'

import { createServerClient } from '@/lib/supabase/server'
import type {
  CoreDeal, CoreDealStatus, FinanceDeal, FinanceScheduleType,
  FinanceLedgerEntry, FinanceLedgerEntryType, FinancePaymentScheduleItem,
  FinanceParticipant, FinanceCollateralLink, FinancePausePeriod
} from '@/lib/types/database'
import { writeAuditLog } from '@/lib/audit'

// ==================== CORE DEALS ====================

const createClient = createServerClient; // Declare the variable here

export async function getFinanceDeals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('core_deals')
    .select(`
      *,
      contact:contacts(*),
      responsible_employee:employees(*),
      finance_deal:finance_deals(
        *,
        participants:finance_participants(*, contact:contacts(*), employee:employees(*)),
        payment_schedule:finance_payment_schedule(*),
        collateral_links:finance_collateral_links(*, asset:assets(*))
      )
    `)
    .eq('kind', 'finance')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as CoreDeal[]
}

export async function getFinanceDealById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('core_deals')
    .select(`
      *,
      contact:contacts(*),
      responsible_employee:employees(*),
      finance_deal:finance_deals(
        *,
        participants:finance_participants(*, contact:contacts(*), employee:employees(*)),
        payment_schedule:finance_payment_schedule(* ),
        collateral_links:finance_collateral_links(*, asset:assets(*))
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CoreDeal
}

export async function createFinanceDeal(params: {
  title: string
  contact_id?: string
  responsible_employee_id?: string
  base_currency: string
  principal_amount: number
  contract_currency: string
  term_months: number
  rate_percent: number
  schedule_type: FinanceScheduleType
}) {
  const supabase = await createClient()

  // Создаём core_deal
  const { data: coreDeal, error: coreErr } = await supabase
    .from('core_deals')
    .insert({
      kind: 'finance',
      status: 'NEW',
      title: params.title,
      base_currency: params.base_currency,
      contact_id: params.contact_id || null,
      responsible_employee_id: params.responsible_employee_id || null,
    })
    .select()
    .single()

  if (coreErr) throw coreErr

  // Создаём finance_deal
  const { data: financeDeal, error: finErr } = await supabase
    .from('finance_deals')
    .insert({
      core_deal_id: coreDeal.id,
      principal_amount: params.principal_amount,
      contract_currency: params.contract_currency,
      term_months: params.term_months,
      rate_percent: params.rate_percent,
      schedule_type: params.schedule_type,
    })
    .select()
    .single()

  if (finErr) throw finErr

  await writeAuditLog(supabase, {
    action: 'create',
    module: 'finance',
    entityTable: 'finance_deals',
    entityId: financeDeal.id,
    after: { coreDeal, financeDeal },
    actorEmployeeId: params.responsible_employee_id,
  })

  return { coreDeal, financeDeal }
}

export async function updateCoreDealStatus(id: string, status: CoreDealStatus, sub_status?: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('core_deals').select('status, sub_status').eq('id', id).single()
  const { error } = await supabase
    .from('core_deals')
    .update({ status, sub_status: sub_status || null })
    .eq('id', id)

  if (error) throw error

  await writeAuditLog(supabase, {
    action: 'status_change',
    module: 'finance',
    entityTable: 'core_deals',
    entityId: id,
    before,
    after: { status, sub_status },
  })
}

// ==================== LEDGER ====================

export async function getFinanceLedger(financeDealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_ledger')
    .select('*')
    .eq('finance_deal_id', financeDealId)
    .order('occurred_at', { ascending: false })

  if (error) throw error
  return (data || []) as FinanceLedgerEntry[]
}

export async function addLedgerEntry(params: {
  finance_deal_id: string
  entry_type: FinanceLedgerEntryType
  amount: number
  currency: string
  base_amount: number
  base_currency: string
  fx_rate?: number
  note?: string
  created_by_employee_id?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_ledger')
    .insert({
      finance_deal_id: params.finance_deal_id,
      entry_type: params.entry_type,
      amount: params.amount,
      currency: params.currency,
      base_amount: params.base_amount,
      base_currency: params.base_currency,
      fx_rate: params.fx_rate || null,
      note: params.note || null,
      created_by_employee_id: params.created_by_employee_id || null,
    })
    .select()
    .single()

  if (error) throw error

  await writeAuditLog(supabase, {
    action: 'ledger_entry',
    module: 'finance',
    entityTable: 'finance_ledger',
    entityId: data.id,
    after: data,
    actorEmployeeId: params.created_by_employee_id,
  })

  return data as FinanceLedgerEntry
}

// ==================== LEDGER + CASHBOX (linked) ====================

export async function addLedgerEntryWithCashbox(params: {
  finance_deal_id: string
  entry_type: FinanceLedgerEntryType
  amount: number
  currency: string
  note?: string
  cashbox_id?: string   // if set, also move money in/out of this cashbox
  created_by_employee_id?: string
}) {
  const supabase = await createClient()

  // If cashbox is linked, use the v2 RPC for atomicity
  if (params.cashbox_id) {
    // disbursement = money OUT of cashbox (negative), repayments = money IN (positive)
    const isOutflow = params.entry_type === 'disbursement'
    const cashboxAmount = isOutflow ? -params.amount : params.amount

    const { data, error } = await supabase.rpc('cashbox_operation_v2', {
      p_cashbox_id: params.cashbox_id,
      p_amount: cashboxAmount,
      p_category: `finance_${params.entry_type}`,
      p_description: params.note || `Фин.сделка: ${params.entry_type}`,
      p_created_by: params.created_by_employee_id || '00000000-0000-0000-0000-000000000000',
      p_finance_deal_id: params.finance_deal_id,
      p_ledger_entry_type: params.entry_type,
      p_ledger_amount: params.amount,
      p_ledger_currency: params.currency,
      p_ledger_note: params.note || null,
    })

    if (error) throw error

    await writeAuditLog(supabase, {
      action: 'ledger_entry_with_cashbox',
      module: 'finance',
      entityTable: 'finance_ledger',
      entityId: (Array.isArray(data) ? data[0] : data)?.ledger_id,
      after: { ...params, cashboxAmount },
      actorEmployeeId: params.created_by_employee_id,
    })

    return { success: true, data: Array.isArray(data) ? data[0] : data }
  }

  // Fallback: plain ledger entry without cashbox link
  const entry = await addLedgerEntry({
    ...params,
    base_amount: params.amount,
    base_currency: params.currency,
  })
  return { success: true, data: entry }
}

// ==================== P&L VIEW ====================

export async function getFinanceDealPnl(financeDealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_finance_deal_pnl')
    .select('*')
    .eq('finance_deal_id', financeDealId)
    .maybeSingle()

  if (error) {
    console.warn('[v0] P&L view error:', error.message)
    return null
  }
  return data as {
    finance_deal_id: string
    principal_amount: number
    contract_currency: string
    rate_percent: number
    term_months: number
    total_disbursed: number
    total_principal_repaid: number
    total_interest_received: number
    total_fees: number
    total_penalties: number
    outstanding_principal: number
    net_income: number
    entry_count: number
  } | null
}

// ==================== PARTICIPANTS ====================

export async function addParticipant(params: {
  finance_deal_id: string
  contact_id?: string
  employee_id?: string
  participant_role: string
  is_primary?: boolean
  note?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('finance_participants')
    .insert({
      finance_deal_id: params.finance_deal_id,
      contact_id: params.contact_id || null,
      employee_id: params.employee_id || null,
      participant_role: params.participant_role,
      is_primary: params.is_primary ?? false,
      note: params.note || null,
    })

  if (error) throw error
}

export async function removeParticipant(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('finance_participants')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ==================== COLLATERAL ====================

export async function linkCollateral(params: {
  finance_deal_id: string
  asset_id: string
  note?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_collateral_links')
    .insert({
      finance_deal_id: params.finance_deal_id,
      asset_id: params.asset_id,
      status: 'active',
      note: params.note || null,
    })
    .select()
    .single()

  if (error) throw error

  await writeAuditLog(supabase, {
    action: 'collateral_link',
    module: 'finance',
    entityTable: 'finance_collateral_links',
    entityId: data.id,
    after: data,
  })
}

export async function updateCollateralStatus(id: string, status: string) {
  const supabase = await createClient()
  const update: Record<string, unknown> = { status }
  if (status !== 'active') {
    update.ended_at = new Date().toISOString()
  }
  const { error } = await supabase
    .from('finance_collateral_links')
    .update(update)
    .eq('id', id)

  if (error) throw error
}

// ==================== PAUSE ====================

export async function addPausePeriod(params: {
  finance_deal_id: string
  start_date: string
  end_date: string
  reason?: string
  created_by_employee_id?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('finance_pause_periods')
    .insert(params)

  if (error) throw error
}

// ==================== PAYMENT SCHEDULE ====================

export async function getPaymentSchedule(financeDealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_payment_schedule')
    .select('*')
    .eq('finance_deal_id', financeDealId)
    .order('due_date', { ascending: true })

  if (error) throw error
  return (data || []) as FinancePaymentScheduleItem[]
}

export async function updatePaymentStatus(id: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('finance_payment_schedule')
    .update({ status })
    .eq('id', id)

  if (error) throw error
}

/**
 * Record a payment against the schedule + update ledger atomically.
 * Uses the DB RPC to distribute payment across schedule rows (FIFO) and write ledger entries.
 */
export async function recordFinancePayment(params: {
  finance_deal_id: string
  payment_amount: number
  currency: string
  cashbox_id?: string
  note?: string
  created_by?: string
}) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase.rpc('record_finance_payment', {
      p_finance_deal_id: params.finance_deal_id,
      p_payment_amount: params.payment_amount,
      p_currency: params.currency,
      p_cashbox_id: params.cashbox_id || null,
      p_note: params.note || null,
      p_created_by: params.created_by || '00000000-0000-0000-0000-000000000000',
    })

    if (error) {
      console.error('[v0] recordFinancePayment error:', error.message)
      return { success: false, error: error.message }
    }

    const row = Array.isArray(data) ? data[0] : data

    await writeAuditLog(supabase, {
      action: 'record_finance_payment',
      module: 'finance',
      entityTable: 'finance_payment_schedule',
      entityId: params.finance_deal_id,
      after: { payment_amount: params.payment_amount, ...params },
      actorEmployeeId: params.created_by,
    })

    return {
      success: true,
      principal_paid: row?.principal_paid,
      interest_paid: row?.interest_paid,
      ledger_ids: row?.ledger_ids,
    }
  } catch (err: any) {
    console.error('[v0] recordFinancePayment error:', err)
    return { success: false, error: err.message || 'Unknown error' }
  }
}

// ==================== UNIFIED DEALS ====================

export async function getUnifiedDeals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_deals_unified')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    // Если view ещё нет - фоллбэк на legacy deals
    console.warn('[v0] v_deals_unified view not available, falling back')
    return []
  }
  return data || []
}

// ==================== TIMELINE ====================

export async function getFinanceDealTimeline(financeDealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_timeline_finance_deal_events')
    .select('*')
    .eq('finance_deal_id', financeDealId)
    .order('event_time', { ascending: false })

  if (error) {
    console.warn('[v0] Timeline view not available')
    return []
  }
  return data || []
}
