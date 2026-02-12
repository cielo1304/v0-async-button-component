'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

export type DepositWithdrawInput = {
  cashboxId: string
  amount: number
  type: 'DEPOSIT' | 'WITHDRAW'
  description?: string
  actorEmployeeId?: string
}

export async function depositWithdraw(input: DepositWithdrawInput) {
  const supabase = await createServerClient()

  try {
    // 1. Получаем кассу для проверок
    const { data: cashbox, error: fetchError } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('id', input.cashboxId)
      .single()

    if (fetchError || !cashbox) {
      return { success: false, error: 'Касса не найдена' }
    }

    if (cashbox.is_archived) {
      return { success: false, error: 'Касса архивирована' }
    }

    // 2. Проверяем баланс для вывода
    if (input.type === 'WITHDRAW' && Number(cashbox.balance) < input.amount) {
      return { success: false, error: `Недостаточно средств. Доступно: ${cashbox.balance} ${cashbox.currency}` }
    }

    const transactionAmount = input.type === 'DEPOSIT' ? input.amount : -input.amount

    // 3. Атомарно: обновляем баланс + создаем транзакцию через RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('cashbox_operation', {
      p_cashbox_id: input.cashboxId,
      p_amount: transactionAmount,
      p_category: input.type,
      p_description: input.description || (input.type === 'DEPOSIT' ? 'Внесение средств' : 'Изъятие средств'),
      p_created_by: input.actorEmployeeId || '00000000-0000-0000-0000-000000000000',
    })

    if (rpcError) {
      return { success: false, error: `Ошибка операции: ${rpcError.message}` }
    }

    revalidatePath('/finance')
    return { success: true, message: `${input.type === 'DEPOSIT' ? 'Внесено' : 'Выведено'} ${input.amount} ${cashbox.currency}` }

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
  const supabase = await createServerClient()
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
  const supabase = await createServerClient()
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
  const supabase = await createServerClient()
  const { data } = await supabase.from('v_cashbox_verified_balance').select('*')
  return data || []
}
