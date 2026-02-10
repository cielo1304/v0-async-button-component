'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type {
  CoreDeal, CoreDealStatus, FinanceDeal, FinanceScheduleType,
  FinanceLedgerEntry, FinanceLedgerEntryType, FinancePaymentScheduleItem,
  FinanceParticipant, FinanceCollateralLink, FinancePausePeriod,
  FinanceCollateralChain
} from '@/lib/types/database'

// -------------------------------------------------------
// Чтение
// -------------------------------------------------------

export async function getFinanceDeals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('core_deals')
    .select(`
      *,
      contact:contacts!core_deals_contact_id_fkey(id, full_name, company),
      responsible_employee:employees!core_deals_responsible_employee_id_fkey(id, full_name),
      finance_deal:finance_deals!finance_deals_core_deal_id_fkey(
        *,
        collateral_links:finance_collateral_links(*, asset:assets(id, title, asset_type, status))
      )
    `)
    .eq('kind', 'finance')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as (CoreDeal & { finance_deal: FinanceDeal[] })[]
}

export async function getFinanceDealById(coreDealId: string) {
  const supabase = await createClient()

  const { data: core, error: coreErr } = await supabase
    .from('core_deals')
    .select(`
      *,
      contact:contacts!core_deals_contact_id_fkey(id, full_name, company, phone),
      responsible_employee:employees!core_deals_responsible_employee_id_fkey(id, full_name)
    `)
    .eq('id', coreDealId)
    .single()
  if (coreErr) throw coreErr

  const { data: fd, error: fdErr } = await supabase
    .from('finance_deals')
    .select('*')
    .eq('core_deal_id', coreDealId)
    .single()
  if (fdErr) throw fdErr

  // Участники
  const { data: participants } = await supabase
    .from('finance_participants')
    .select(`
      *,
      contact:contacts(id, full_name, company),
      employee:employees(id, full_name)
    `)
    .eq('finance_deal_id', fd.id)
    .order('is_primary', { ascending: false })

  // График
  const { data: schedule } = await supabase
    .from('finance_payment_schedule')
    .select('*')
    .eq('finance_deal_id', fd.id)
    .order('due_date', { ascending: true })

  // Леджер
  const { data: ledger } = await supabase
    .from('finance_ledger')
    .select(`
      *,
      created_by_employee:employees!finance_ledger_created_by_employee_id_fkey(id, full_name)
    `)
    .eq('finance_deal_id', fd.id)
    .order('occurred_at', { ascending: false })

  // Залоги
  const { data: collaterals } = await supabase
    .from('finance_collateral_links')
    .select(`
      *,
      asset:assets(id, title, asset_type, status)
    `)
    .eq('finance_deal_id', fd.id)
    .order('started_at', { ascending: false })

  // Паузы
  const { data: pauses } = await supabase
    .from('finance_pause_periods')
    .select('*')
    .eq('finance_deal_id', fd.id)
    .order('start_date', { ascending: false })

  // Цепочка замен залогов
  const { data: chain } = await supabase
    .from('finance_collateral_chain')
    .select(`
      *,
      old_asset:assets!finance_collateral_chain_old_asset_id_fkey(id, title),
      new_asset:assets!finance_collateral_chain_new_asset_id_fkey(id, title)
    `)
    .eq('finance_deal_id', fd.id)
    .order('created_at', { ascending: false })

  return {
    core: core as CoreDeal,
    finance: fd as FinanceDeal,
    participants: (participants || []) as FinanceParticipant[],
    schedule: (schedule || []) as FinancePaymentScheduleItem[],
    ledger: (ledger || []) as FinanceLedgerEntry[],
    collaterals: (collaterals || []) as FinanceCollateralLink[],
    pauses: (pauses || []) as FinancePausePeriod[],
    chain: (chain || []) as FinanceCollateralChain[],
  }
}

// -------------------------------------------------------
// Создание
// -------------------------------------------------------

export async function createFinanceDeal(data: {
  title: string
  contact_id: string | null
  responsible_employee_id: string | null
  base_currency: string
  principal_amount: number
  contract_currency: string
  term_months: number
  rate_percent: number
  schedule_type: FinanceScheduleType
}) {
  const supabase = await createClient()

  // 1. core_deal
  const { data: core, error: coreErr } = await supabase
    .from('core_deals')
    .insert({
      kind: 'finance',
      status: 'NEW',
      title: data.title,
      base_currency: data.base_currency,
      contact_id: data.contact_id,
      responsible_employee_id: data.responsible_employee_id,
    })
    .select()
    .single()
  if (coreErr) throw coreErr

  // 2. finance_deal
  const { data: fd, error: fdErr } = await supabase
    .from('finance_deals')
    .insert({
      core_deal_id: core.id,
      principal_amount: data.principal_amount,
      contract_currency: data.contract_currency,
      term_months: data.term_months,
      rate_percent: data.rate_percent,
      schedule_type: data.schedule_type,
    })
    .select()
    .single()
  if (fdErr) throw fdErr

  await logAudit('create', 'finance', 'core_deals', core.id, null, core)
  return { core, finance: fd }
}

// -------------------------------------------------------
// Обновление статуса
// -------------------------------------------------------

export async function updateFinanceDealStatus(coreDealId: string, status: CoreDealStatus) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('core_deals').select('*').eq('id', coreDealId).single()
  const { error } = await supabase.from('core_deals').update({ status }).eq('id', coreDealId)
  if (error) throw error
  const { data: after } = await supabase.from('core_deals').select('*').eq('id', coreDealId).single()
  await logAudit('update_status', 'finance', 'core_deals', coreDealId, before, after)
}

// -------------------------------------------------------
// Леджер
// -------------------------------------------------------

export async function addLedgerEntry(financeDealId: string, data: {
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
  const { data: entry, error } = await supabase
    .from('finance_ledger')
    .insert({
      finance_deal_id: financeDealId,
      entry_type: data.entry_type,
      amount: data.amount,
      currency: data.currency,
      base_amount: data.base_amount,
      base_currency: data.base_currency,
      fx_rate: data.fx_rate || null,
      note: data.note || null,
      created_by_employee_id: data.created_by_employee_id || null,
    })
    .select()
    .single()
  if (error) throw error
  await logAudit('create', 'finance', 'finance_ledger', entry.id, null, entry)
  return entry
}

// -------------------------------------------------------
// Участники
// -------------------------------------------------------

export async function addParticipant(financeDealId: string, data: {
  contact_id?: string
  employee_id?: string
  participant_role: string
  is_primary: boolean
  note?: string
}) {
  const supabase = await createClient()
  const { data: p, error } = await supabase
    .from('finance_participants')
    .insert({
      finance_deal_id: financeDealId,
      contact_id: data.contact_id || null,
      employee_id: data.employee_id || null,
      participant_role: data.participant_role,
      is_primary: data.is_primary,
      note: data.note || null,
    })
    .select()
    .single()
  if (error) throw error
  return p
}

export async function removeParticipant(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('finance_participants').delete().eq('id', id)
  if (error) throw error
}

// -------------------------------------------------------
// Залоги
// -------------------------------------------------------

export async function linkCollateral(financeDealId: string, assetId: string, note?: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finance_collateral_links')
    .insert({
      finance_deal_id: financeDealId,
      asset_id: assetId,
      status: 'active',
      note: note || null,
    })
    .select()
    .single()
  if (error) throw error

  // Обновляем статус актива на pledged
  await supabase.from('assets').update({ status: 'pledged' }).eq('id', assetId)
  await logAudit('link_collateral', 'finance', 'finance_collateral_links', data.id, null, data)
  return data
}

export async function releaseCollateral(linkId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('finance_collateral_links').select('*').eq('id', linkId).single()
  const { error } = await supabase
    .from('finance_collateral_links')
    .update({ status: 'released', ended_at: new Date().toISOString() })
    .eq('id', linkId)
  if (error) throw error

  if (before?.asset_id) {
    await supabase.from('assets').update({ status: 'released' }).eq('id', before.asset_id)
  }
  await logAudit('release_collateral', 'finance', 'finance_collateral_links', linkId, before, { status: 'released' })
}

// -------------------------------------------------------
// Унифицированный список сделок
// -------------------------------------------------------

export async function getUnifiedDeals() {
  const supabase = await createClient()

  // Пробуем view, если нет - собираем вручную
  const { data: unified, error: viewErr } = await supabase
    .from('v_deals_unified')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!viewErr && unified) return unified

  // Fallback: вручную
  const [legacyRes, autoRes, financeRes] = await Promise.all([
    supabase.from('deals').select('id, title, status, amount, currency, contact_id, created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('auto_deals').select('id, title, status, price, currency, client_id, created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('core_deals').select('id, title, status, base_currency, contact_id, created_at, finance_deal:finance_deals(principal_amount, contract_currency)').eq('kind', 'finance').order('created_at', { ascending: false }).limit(200),
  ])

  const result: Array<{
    unified_id: string; source: string; entity_id: string; kind: string;
    title: string; status: string; amount: number | null; currency: string | null;
    contact_id: string | null; created_at: string;
  }> = []

  for (const d of legacyRes.data || []) {
    result.push({ unified_id: `deals_${d.id}`, source: 'legacy_deals', entity_id: d.id, kind: 'deals', title: d.title || 'Сделка', status: d.status, amount: d.amount, currency: d.currency, contact_id: d.contact_id, created_at: d.created_at })
  }
  for (const d of autoRes.data || []) {
    result.push({ unified_id: `auto_${d.id}`, source: 'auto_deals', entity_id: d.id, kind: 'auto', title: d.title || 'Авто', status: d.status, amount: d.price, currency: d.currency, contact_id: d.client_id, created_at: d.created_at })
  }
  for (const d of financeRes.data || []) {
    const fd = Array.isArray(d.finance_deal) ? d.finance_deal[0] : d.finance_deal
    result.push({ unified_id: `finance_${d.id}`, source: 'finance', entity_id: d.id, kind: 'finance', title: d.title || 'Фин. сделка', status: d.status, amount: fd?.principal_amount || null, currency: fd?.contract_currency || d.base_currency, contact_id: d.contact_id, created_at: d.created_at })
  }

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return result
}
