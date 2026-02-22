'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { generateSchedule, computeBalances, totalPausedDays } from '@/lib/finance/math'
import { writeAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

// ────────────────────────────────────────────────
// 0. MANDATORY: Generate initial schedule (called after deal creation)
// ────────────────────────────────────────────────

/**
 * Generates payment schedule immediately after creating a finance deal.
 * This ensures every deal has a schedule from day one (Variant A requirement).
 */
export async function generateInitialSchedule(financeDealId: string, coreDealId: string) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { data: fd, error: fdErr } = await supabase
      .from('finance_deals')
      .select('*, core_deal:core_deals(*)')
      .eq('id', financeDealId)
      .single()

    if (fdErr || !fd) return { success: false, error: 'Finance deal not found' }

    // Skip manual/tranches schedules
    if (fd.schedule_type === 'manual' || fd.schedule_type === 'tranches') {
      return { success: true, message: 'Manual schedule — no auto-generation', rows: 0 }
    }

    const startDate = (fd.core_deal as any)?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)

    const rows = generateSchedule({
      principal: Number(fd.principal_amount),
      annualRate: Number(fd.rate_percent),
      termMonths: fd.term_months,
      startDate,
      scheduleType: fd.schedule_type,
      pausePeriods: [],
    })

    if (rows.length > 0) {
      const inserts = rows.map(r => ({
        finance_deal_id: financeDealId,
        due_date: r.dueDate,
        principal_due: r.principalDue,
        interest_due: r.interestDue,
        total_due: r.totalDue,
        currency: fd.contract_currency || 'USD',
        status: 'PLANNED',
      }))

      const { error: insertErr } = await supabase
        .from('finance_payment_schedule')
        .insert(inserts)

      if (insertErr) return { success: false, error: insertErr.message }
    }

    await writeAuditLog(supabase, {
      action: 'generate_initial_schedule',
      module: 'finance',
      entityTable: 'finance_payment_schedule',
      entityId: financeDealId,
      after: { rows: rows.length },
    })

    revalidatePath(`/finance-deals/${coreDealId}`)
    return { success: true, message: `Initial schedule generated: ${rows.length} payments`, rows: rows.length }
  } catch (e) {
    console.error('[v0] generateInitialSchedule error:', e)
    return { success: false, error: 'Failed to generate initial schedule' }
  }
}

// ────────────────────────────────────────────────
// 1. Regenerate payment schedule (idempotent)
// ────────────────────────────────────────────────

export async function regenerateSchedule(financeDealId: string) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // Fetch deal details
    const { data: fd, error: fdErr } = await supabase
      .from('finance_deals')
      .select('*, core_deal:core_deals(*)')
      .eq('id', financeDealId)
      .single()

    if (fdErr || !fd) return { success: false, error: 'Финансовая сделка не найдена' }

    if (fd.schedule_type === 'manual' || fd.schedule_type === 'tranches') {
      return { success: true, message: 'Ручной график — пересчёт не требуется', rows: 0 }
    }

    // Fetch pause periods
    const { data: pauses } = await supabase
      .from('finance_pause_periods')
      .select('start_date, end_date')
      .eq('finance_deal_id', financeDealId)
      .order('start_date')

    const pausePeriods = (pauses || []).map(p => ({
      startDate: p.start_date,
      endDate: p.end_date,
    }))

    // Generate new schedule
    const rows = generateSchedule({
      principal: Number(fd.principal_amount),
      annualRate: Number(fd.rate_percent),
      termMonths: fd.term_months,
      startDate: (fd.core_deal as any)?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      scheduleType: fd.schedule_type,
      pausePeriods,
    })

    // Delete old schedule rows
    await supabase
      .from('finance_payment_schedule')
      .delete()
      .eq('finance_deal_id', financeDealId)

    // Insert new rows
    if (rows.length > 0) {
      const inserts = rows.map(r => ({
        finance_deal_id: financeDealId,
        due_date: r.dueDate,
        principal_due: r.principalDue,
        interest_due: r.interestDue,
        total_due: r.totalDue,
        currency: fd.contract_currency || 'USD',
        status: 'PLANNED',
      }))

      const { error: insertErr } = await supabase
        .from('finance_payment_schedule')
        .insert(inserts)

      if (insertErr) return { success: false, error: insertErr.message }
    }

    revalidatePath(`/finance-deals/${(fd.core_deal as any)?.id || ''}`)
    return { success: true, message: `График пересчитан: ${rows.length} платежей`, rows: rows.length }
  } catch (e) {
    return { success: false, error: 'Ошибка пересчёта графика' }
  }
}

// ────────────────────────────────────────────────
// 2. Pause deal
// ────────────────────────────────────────────────

export async function pauseDeal(params: {
  coreDealId: string
  financeDealId: string
  startDate: string
  endDate: string
  reason?: string
  actorEmployeeId?: string
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // Validate dates
    if (params.startDate >= params.endDate) {
      return { success: false, error: 'Дата начала должна быть раньше даты окончания' }
    }

    // Insert pause period
    const { data: pause, error: pauseErr } = await supabase
      .from('finance_pause_periods')
      .insert({
        finance_deal_id: params.financeDealId,
        start_date: params.startDate,
        end_date: params.endDate,
        reason: params.reason || null,
        created_by_employee_id: params.actorEmployeeId || null,
      })
      .select()
      .single()

    if (pauseErr) return { success: false, error: pauseErr.message }

    // Set deal status to PAUSED if start_date <= today
    const today = new Date().toISOString().slice(0, 10)
    if (params.startDate <= today && params.endDate >= today) {
      await supabase
        .from('core_deals')
        .update({ status: 'PAUSED', sub_status: 'pause_active' })
        .eq('id', params.coreDealId)
    }

    // Recalculate schedule
    await regenerateSchedule(params.financeDealId)

    // Audit
    await writeAuditLog(supabase, {
      action: 'pause',
      module: 'finance',
      entityTable: 'finance_pause_periods',
      entityId: pause.id,
      after: pause,
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.coreDealId}`)
    return { success: true, message: 'Пауза добавлена, график пересчитан' }
  } catch {
    return { success: false, error: 'Ошибка добавления паузы' }
  }
}

// ────────────────────────────────────────────────
// 3. Resume deal (end pause early)
// ────────────────────────────────────────────────

export async function resumeDeal(params: {
  coreDealId: string
  financeDealId: string
  pauseId: string
  actorEmployeeId?: string
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const today = new Date().toISOString().slice(0, 10)

    // End the pause period at today
    const { error: updateErr } = await supabase
      .from('finance_pause_periods')
      .update({ end_date: today })
      .eq('id', params.pauseId)

    if (updateErr) return { success: false, error: updateErr.message }

    // Set status back to ACTIVE
    await supabase
      .from('core_deals')
      .update({ status: 'ACTIVE', sub_status: null })
      .eq('id', params.coreDealId)

    // Recalculate schedule
    await regenerateSchedule(params.financeDealId)

    // Audit
    await writeAuditLog(supabase, {
      action: 'resume',
      module: 'finance',
      entityTable: 'finance_pause_periods',
      entityId: params.pauseId,
      after: { end_date: today },
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.coreDealId}`)
    return { success: true, message: 'Сделка возобновлена, график пересчитан' }
  } catch {
    return { success: false, error: 'Ошибка возобновления' }
  }
}

// ────────────────────────────────────────────────
// 4. Delete pause period
// ────────────────────────────────────────────────

export async function deletePause(params: {
  coreDealId: string
  financeDealId: string
  pauseId: string
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { error } = await supabase
      .from('finance_pause_periods')
      .delete()
      .eq('id', params.pauseId)

    if (error) return { success: false, error: error.message }

    // Check if there are any active pauses left
    const today = new Date().toISOString().slice(0, 10)
    const { data: remaining } = await supabase
      .from('finance_pause_periods')
      .select('id')
      .eq('finance_deal_id', params.financeDealId)
      .lte('start_date', today)
      .gte('end_date', today)

    if (!remaining || remaining.length === 0) {
      // No more active pauses — set back to ACTIVE if currently PAUSED
      const { data: deal } = await supabase
        .from('core_deals')
        .select('status')
        .eq('id', params.coreDealId)
        .single()

      if (deal?.status === 'PAUSED') {
        await supabase
          .from('core_deals')
          .update({ status: 'ACTIVE', sub_status: null })
          .eq('id', params.coreDealId)
      }
    }

    await regenerateSchedule(params.financeDealId)

    revalidatePath(`/finance-deals/${params.coreDealId}`)
    return { success: true, message: 'Пауза удалена, график пересчитан' }
  } catch {
    return { success: false, error: 'Ошибка удаления паузы' }
  }
}

// ────────────────────────────────────────────────
// 5. Get deal summary (balances + paused days)
// ────────────────────────────────────────────────

export async function getDealSummary(financeDealId: string) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const [fdRes, ledgerRes, pausesRes, scheduleRes] = await Promise.all([
      supabase.from('finance_deals').select('principal_amount, contract_currency').eq('id', financeDealId).single(),
      supabase.from('finance_ledger').select('entry_type, amount').eq('finance_deal_id', financeDealId),
      supabase.from('finance_pause_periods').select('start_date, end_date').eq('finance_deal_id', financeDealId),
      supabase.from('finance_payment_schedule').select('interest_due, interest_paid, due_date').eq('finance_deal_id', financeDealId),
    ])

    if (!fdRes.data) return { success: false, error: 'Сделка не найдена' }

    const balances = computeBalances(
      Number(fdRes.data.principal_amount),
      (ledgerRes.data || []).map(e => ({ entry_type: e.entry_type, amount: Number(e.amount) })),
    )

    const pausedDays = totalPausedDays(
      (pausesRes.data || []).map(p => ({ startDate: p.start_date, endDate: p.end_date })),
    )

    // Calculate unpaid_interest from schedule
    const today = new Date().toISOString().slice(0, 10)
    const unpaid_interest = (scheduleRes.data || [])
      .filter(s => s.due_date <= today)
      .reduce((sum, s) => {
        const due = Number(s.interest_due || 0)
        const paid = Number(s.interest_paid || 0)
        return sum + Math.max(0, due - paid)
      }, 0)

    // Update totalOwed to include unpaid_interest
    const totalOwed = balances.outstandingPrincipal + unpaid_interest

    return {
      success: true,
      balances: { ...balances, totalOwed },
      pausedDays,
      unpaid_interest,
      currency: fdRes.data.contract_currency,
    }
  } catch {
    return { success: false, error: 'Ошибка расчёта' }
  }
}
