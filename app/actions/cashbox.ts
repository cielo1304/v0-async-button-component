'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { writeAuditLog } from '@/lib/audit'
import { assertNotReadOnly } from '@/lib/view-as'

export type DepositWithdrawInput = {
  cashboxId: string
  amount: number
  type: 'DEPOSIT' | 'WITHDRAW'
  description?: string
  actorEmployeeId?: string
}

export async function depositWithdraw(input: DepositWithdrawInput) {
  await assertNotReadOnly()
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const transactionAmount = input.type === 'DEPOSIT' ? input.amount : -input.amount

    // Use cashbox_operation_v2 for balance validation at DB level
    const { data: rpcResult, error: rpcError } = await supabase.rpc('cashbox_operation_v2', {
      p_cashbox_id: input.cashboxId,
      p_amount: transactionAmount,
      p_category: input.type,
      p_description: input.description || (input.type === 'DEPOSIT' ? 'Внесение средств' : 'Изъятие средств'),
      p_created_by: input.actorEmployeeId || '00000000-0000-0000-0000-000000000000',
    })

    if (rpcError) {
      return { success: false, error: `Ошибка операции: ${rpcError.message}` }
    }

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_deposit_withdraw',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: input.cashboxId,
        after: {
          type: input.type,
          amount: input.amount,
          description: input.description,
          tx_id: rpcResult?.[0]?.tx_id,
          new_balance: rpcResult?.[0]?.new_balance,
          effective_actor: input.actorEmployeeId || '00000000-0000-0000-0000-000000000000',
        },
        actorEmployeeId: input.actorEmployeeId,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for depositWithdraw:', auditErr)
    }

    revalidatePath('/finance')
    return { success: true, message: `${input.type === 'DEPOSIT' ? 'Внесено' : 'Выведено'} ${input.amount}` }

  } catch {
    return { success: false, error: 'Неизвестная ошибка' }
  }
}

// ─── cashbox_operation_v2: atomic cashbox + optional finance_ledger entry ───

export type CashboxOperationV2Input = {
  cashboxId: string
  amount: number          // signed: positive = deposit, negative = withdraw
  category: string
  description?: string
  referenceId?: string
  dealId?: string
  createdBy?: string
  // finance-ledger link (optional)
  financeDealId?: string
  ledgerEntryType?: string
  ledgerAmount?: number
  ledgerCurrency?: string
  ledgerNote?: string
}

export async function cashboxOperationV2(input: CashboxOperationV2Input) {
  await assertNotReadOnly()
  const { supabase } = await createSupabaseAndRequireUser()
  try {
    const { data, error } = await supabase.rpc('cashbox_operation_v2', {
      p_cashbox_id: input.cashboxId,
      p_amount: input.amount,
      p_category: input.category,
      p_description: input.description || null,
      p_reference_id: input.referenceId || null,
      p_deal_id: input.dealId || null,
      p_created_by: input.createdBy || '00000000-0000-0000-0000-000000000000',
      p_finance_deal_id: input.financeDealId || null,
      p_ledger_entry_type: input.ledgerEntryType || null,
      p_ledger_amount: input.ledgerAmount ?? null,
      p_ledger_currency: input.ledgerCurrency || 'USD',
      p_ledger_note: input.ledgerNote || null,
    })

    if (error) {
      return { success: false, error: `RPC error: ${error.message}` }
    }

    const row = Array.isArray(data) ? data[0] : data
    revalidatePath('/finance')
    revalidatePath('/finance-deals')
    return {
      success: true,
      newBalance: row?.new_balance,
      txId: row?.tx_id,
      ledgerId: row?.ledger_id,
    }
  } catch {
    return { success: false, error: 'Неизвестная ошибка cashbox_operation_v2' }
  }
}

// ─── P&L from VIEW ───

export async function getFinanceDealPnl(financeDealId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('v_finance_deal_pnl')
    .select('*')
    .eq('finance_deal_id', financeDealId)
    .maybeSingle()

  if (error) return null
  return data
}

// ─── Verified cashbox balances ───

export async function getVerifiedBalances() {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data } = await supabase.from('v_cashbox_verified_balance').select('*')
  return data || []
}

// ─── Atomic cashbox transfer (same currency) ───

export type CashboxTransferInput = {
  fromCashboxId: string
  toCashboxId: string
  amount: number
  note?: string
  createdBy?: string
}

export async function cashboxTransfer(input: CashboxTransferInput) {
  await assertNotReadOnly()
  const { supabase } = await createSupabaseAndRequireUser()
  try {
    const { data, error } = await supabase.rpc('cashbox_transfer', {
      p_from_cashbox_id: input.fromCashboxId,
      p_to_cashbox_id: input.toCashboxId,
      p_amount: input.amount,
      p_note: input.note || null,
      p_created_by: input.createdBy || '00000000-0000-0000-0000-000000000000',
    })

  if (error) {
  return { success: false, error: `Transfer error: ${error.message}` }
  }
  
  const row = Array.isArray(data) ? data[0] : data

  // Write audit log (non-blocking)
  try {
    await writeAuditLog(supabase, {
      action: 'cashbox_transfer',
      module: 'finance',
      entityTable: 'cashboxes',
      entityId: input.fromCashboxId,
      after: {
        toCashboxId: input.toCashboxId,
        amount: input.amount,
        note: input.note,
        from_tx_id: row?.from_tx_id,
        to_tx_id: row?.to_tx_id,
        from_balance: row?.from_balance,
        to_balance: row?.to_balance,
        effective_actor: input.createdBy || '00000000-0000-0000-0000-000000000000',
      },
      actorEmployeeId: input.createdBy,
    })
  } catch (auditErr) {
    console.error('[v0] Audit log failed for cashboxTransfer:', auditErr)
  }

  revalidatePath('/finance')
  return {
  success: true,
  fromTxId: row?.from_tx_id,
  toTxId: row?.to_tx_id,
  fromBalance: row?.from_balance,
  toBalance: row?.to_balance,
  }
  } catch {
  return { success: false, error: 'Неизвестная ошибка transfer' }
  }
  }

// ─── Atomic cashbox exchange (different currencies) ───

export type CashboxExchangeInput = {
  fromCashboxId: string
  toCashboxId: string
  fromAmount: number
  toAmount: number
  rate: number
  note?: string
  createdBy?: string
}

export async function cashboxExchange(input: CashboxExchangeInput) {
  const { supabase } = await createSupabaseAndRequireUser()
  try {
    // Fix #4.2 C1: Use secure internal_exchange_post RPC instead of old cashbox_exchange
    // 1. Get company_id from cashbox (strict - not "first company")
    const { data: fromCashbox, error: cashboxError } = await supabase
      .from('cashboxes')
      .select('company_id, currency')
      .eq('id', input.fromCashboxId)
      .single()

    if (cashboxError || !fromCashbox) {
      return { success: false, error: `From cashbox not found: ${cashboxError?.message || 'unknown'}` }
    }

    const companyId = fromCashbox.company_id
    if (!companyId) {
      return { success: false, error: 'Cashbox has no company_id' }
    }

    // 2. Generate request_id for idempotency
    const requestId = crypto.randomUUID()

    // 3. Call internal_exchange_post RPC
    const { data: exchangeLogId, error } = await supabase.rpc('internal_exchange_post', {
      request_id: requestId,
      p_company_id: companyId,
      from_cashbox_id: input.fromCashboxId,
      to_cashbox_id: input.toCashboxId,
      from_amount: input.fromAmount,
      rate: input.rate,
      fee: 0, // No fee for internal exchanges
      comment: input.note || null,
      acted_by: input.createdBy ? input.createdBy : null,
    })

    if (error) {
      return { success: false, error: `Exchange error: ${error.message}` }
    }

    // 4. Audit log handled by RPC, but write additional app-level log
    try {
      await writeAuditLog(supabase, {
        action: 'internal_exchange',
        module: 'finance',
        entityTable: 'exchange_logs',
        entityId: exchangeLogId as string,
        after: {
          fromCashboxId: input.fromCashboxId,
          toCashboxId: input.toCashboxId,
          fromAmount: input.fromAmount,
          rate: input.rate,
          note: input.note,
          companyId,
          requestId,
        },
        actorEmployeeId: input.createdBy,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for cashboxExchange:', auditErr)
    }

    revalidatePath('/finance')
    revalidatePath('/exchange')
    return {
      success: true,
      exchangeLogId: exchangeLogId as string,
    }
  } catch (err: any) {
    console.error('[v0] cashboxExchange error:', err)
    return { success: false, error: err.message || 'Неизвестная ошибка exchange' }
  }
}

// ─── Update cashbox sort order ───

export async function updateCashboxSortOrder(cashboxId: string, sortOrder: number) {
  const { supabase } = await createSupabaseAndRequireUser()
  
  try {
    const { error } = await supabase
      .from('cashboxes')
      .update({ sort_order: sortOrder })
      .eq('id', cashboxId)
    
    if (error) throw error

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_sort_order_update',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: cashboxId,
        after: { sort_order: sortOrder },
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for updateCashboxSortOrder:', auditErr)
    }
    
    revalidatePath('/finance')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка обновления порядка' }
  }
}

// ─── Toggle exchange enabled flag ───

export async function toggleExchangeEnabled(cashboxId: string, enabled: boolean) {
  const { supabase } = await createSupabaseAndRequireUser()
  
  try {
    // STEP 10: Only platform admins can toggle exchange
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin')
    
    if (adminError) {
      console.error('[v0] is_platform_admin RPC error:', adminError)
      return { success: false, error: 'Failed to verify admin status' }
    }

    if (!isAdmin) {
      return { success: false, error: 'Access denied: only platform admins can toggle exchange settings' }
    }

    const { error } = await supabase
      .from('cashboxes')
      .update({ is_exchange_enabled: enabled })
      .eq('id', cashboxId)
    
    if (error) throw error

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_exchange_enabled_toggle',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: cashboxId,
        after: { is_exchange_enabled: enabled },
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for toggleExchangeEnabled:', auditErr)
    }
    
    revalidatePath('/finance')
    revalidatePath('/exchange')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка обновления настройки обмена' }
  }
}

// ─── Create cashbox (Fix #8) ───

export type CreateCashboxInput = {
  name: string
  type: string
  currency: string
  initial_balance?: number
  balance?: number
  location?: string | null
  holder_name?: string | null
  holder_phone?: string | null
  is_hidden?: boolean
  is_archived?: boolean
  is_exchange_enabled?: boolean
  actorEmployeeId?: string
  // Explicit company_id override (optional; resolved from team_members if omitted)
  company_id?: string
}

export async function createCashbox(input: CreateCashboxInput) {
  const { supabase, user } = await createSupabaseAndRequireUser()

  try {
    // Resolve company_id: prefer explicit override, then lookup from team_members
    let companyId = input.company_id ?? null
    if (!companyId) {
      const { data: membership, error: memberError } = await supabase
        .from('team_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (memberError || !membership?.company_id) {
        return { success: false, error: `Не удалось определить компанию пользователя: ${memberError?.message || 'нет членства'}` }
      }
      companyId = membership.company_id
    }

    const { data: newCashbox, error } = await supabase
      .from('cashboxes')
      .insert({
        name: input.name,
        type: input.type,
        currency: input.currency,
        balance: input.balance ?? input.initial_balance ?? 0,
        initial_balance: input.initial_balance ?? 0,
        location: input.location || null,
        holder_name: input.holder_name || null,
        holder_phone: input.holder_phone || null,
        is_hidden: input.is_hidden ?? false,
        is_archived: input.is_archived ?? false,
        is_exchange_enabled: input.is_exchange_enabled ?? false,
        company_id: companyId,
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: `Ошибка создания кассы: ${error.message}` }
    }

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_create',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: newCashbox.id,
        after: input,
        actorEmployeeId: input.actorEmployeeId,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for createCashbox:', auditErr)
    }

    revalidatePath('/finance')
    revalidatePath('/exchange')
    return { success: true, cashbox: newCashbox }
  } catch (err: any) {
    return { success: false, error: err.message || 'Неизвестная ошибка создания кассы' }
  }
}

// ─── Update cashbox (Fix #8) ───

export type UpdateCashboxInput = {
  id: string
  patch: {
    name?: string
    type?: string
    location?: string | null
    holder_name?: string | null
    holder_phone?: string | null
    is_hidden?: boolean
    is_archived?: boolean
    is_exchange_enabled?: boolean
  }
  actorEmployeeId?: string
}

export async function updateCashbox(input: UpdateCashboxInput) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // Get before state for audit
    const { data: before } = await supabase
      .from('cashboxes')
      .select('name, type, location, holder_name, holder_phone, is_hidden, is_archived, is_exchange_enabled')
      .eq('id', input.id)
      .single()

    const { error } = await supabase
      .from('cashboxes')
      .update({
        ...input.patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)

    if (error) {
      return { success: false, error: `Ошибка обновления кассы: ${error.message}` }
    }

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_update',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: input.id,
        before,
        after: input.patch,
        actorEmployeeId: input.actorEmployeeId,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for updateCashbox:', auditErr)
    }

    revalidatePath('/finance')
    revalidatePath('/exchange')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Неизвестная ошибка обновления кассы' }
  }
}

// ─── Delete cashbox (Fix #8) ───

export type DeleteCashboxInput = {
  id: string
  actorEmployeeId?: string
}

export async function deleteCashbox(input: DeleteCashboxInput) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // Check if there are any transactions
    const { count, error: countError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('cashbox_id', input.id)

    if (countError) {
      return { success: false, error: `Ошибка проверки транзакций: ${countError.message}` }
    }

    if (count && count > 0) {
      return {
        success: false,
        error: `Есть ${count} связанных транзакций. Удалять нельзя, используйте архив.`,
      }
    }

    const { error } = await supabase.from('cashboxes').delete().eq('id', input.id)

    if (error) {
      return { success: false, error: `Ошибка удаления кассы: ${error.message}` }
    }

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_delete',
        module: 'finance',
        entityTable: 'cashboxes',
        entityId: input.id,
        actorEmployeeId: input.actorEmployeeId,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for deleteCashbox:', auditErr)
    }

    revalidatePath('/finance')
    revalidatePath('/exchange')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Неизвестная ошибка удаления кассы' }
  }
}

// ─── Update cashbox sort orders (bulk) (Fix #8) ───

export type UpdateCashboxSortOrdersInput = {
  items: Array<{ id: string; sort_order: number }>
  actorEmployeeId?: string
}

export async function updateCashboxSortOrders(input: UpdateCashboxSortOrdersInput) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // Update each cashbox sort order
    for (const item of input.items) {
      const { error } = await supabase
        .from('cashboxes')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)

      if (error) throw error
    }

    // Write audit log (non-blocking)
    try {
      await writeAuditLog(supabase, {
        action: 'cashbox_sort_order_update_bulk',
        module: 'finance',
        entityTable: 'cashboxes',
        after: { items: input.items },
        actorEmployeeId: input.actorEmployeeId,
      })
    } catch (auditErr) {
      console.error('[v0] Audit log failed for updateCashboxSortOrders:', auditErr)
    }

    revalidatePath('/finance')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка обновления порядка касс' }
  }
}
