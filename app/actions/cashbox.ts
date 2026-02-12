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

// ─── Atomic cashbox transfer (same currency) ───

export type CashboxTransferInput = {
  fromCashboxId: string
  toCashboxId: string
  amount: number
  note?: string
  createdBy?: string
}

export async function cashboxTransfer(input: CashboxTransferInput) {
  const supabase = await createServerClient()
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
  const supabase = await createServerClient()
  try {
    const { data, error } = await supabase.rpc('cashbox_exchange', {
      p_from_cashbox_id: input.fromCashboxId,
      p_to_cashbox_id: input.toCashboxId,
      p_from_amount: input.fromAmount,
      p_to_amount: input.toAmount,
      p_rate: input.rate,
      p_note: input.note || null,
      p_created_by: input.createdBy || '00000000-0000-0000-0000-000000000000',
    })

    if (error) {
      return { success: false, error: `Exchange error: ${error.message}` }
    }

    const row = Array.isArray(data) ? data[0] : data
    revalidatePath('/finance')
    revalidatePath('/exchange')
    return {
      success: true,
      fromTxId: row?.from_tx_id,
      toTxId: row?.to_tx_id,
      fromBalance: row?.from_balance,
      toBalance: row?.to_balance,
    }
  } catch {
    return { success: false, error: 'Неизвестная ошибка exchange' }
  }
}
