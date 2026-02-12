'use server'

import { createClient } from '@/lib/supabase/server'

export interface AutoActionResult {
  success: boolean
  error?: string
  data?: any
}

/**
 * Create a purchase record for a car
 * Records the purchase cost as negative in auto_ledger
 */
export async function createAutoPurchase(params: {
  carId: string
  supplierName: string
  purchaseAmount: number
  description?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('auto_create_purchase_v1', {
      p_car_id: params.carId,
      p_supplier_name: params.supplierName,
      p_purchase_amount: params.purchaseAmount,
      p_description: params.description || null,
      p_actor_employee_id: params.actorEmployeeId || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const result = data as { success: boolean; error?: string; amount?: number }

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to create purchase' }
    }

    return {
      success: true,
      data: { amount: result.amount },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Record an expense for a car
 * Expenses are recorded as negative in auto_ledger
 */
export async function recordAutoExpense(params: {
  carId: string
  amount: number
  description?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('auto_record_expense_v1', {
      p_car_id: params.carId,
      p_amount: params.amount,
      p_description: params.description || null,
      p_actor_employee_id: params.actorEmployeeId || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const result = data as { success: boolean; error?: string; amount?: number }

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to record expense' }
    }

    return {
      success: true,
      data: { amount: result.amount },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Create a sale deal for a car
 * Creates auto_deal record and ledger entry for SALE_REVENUE
 */
export async function createAutoDeal(params: {
  carId: string
  buyerId: string
  dealType: 'CASH_SALE' | 'COMMISSION_SALE' | 'INSTALLMENT' | 'RENTAL'
  totalAmount: number
  description?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('auto_create_deal_v1', {
      p_car_id: params.carId,
      p_buyer_id: params.buyerId,
      p_deal_type: params.dealType,
      p_total_amount: params.totalAmount,
      p_description: params.description || null,
      p_actor_employee_id: params.actorEmployeeId || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const result = data as {
      success: boolean
      error?: string
      deal_id?: string
      deal_number?: string
    }

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to create deal' }
    }

    return {
      success: true,
      data: { dealId: result.deal_id, dealNumber: result.deal_number },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Record a payment for an auto deal
 * Updates auto_deal paid_amount and creates ledger entry
 */
export async function recordAutoPayment(params: {
  dealId: string
  amount: number
  description?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('auto_record_payment_v1', {
      p_deal_id: params.dealId,
      p_amount: params.amount,
      p_description: params.description || null,
      p_actor_employee_id: params.actorEmployeeId || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const result = data as {
      success: boolean
      error?: string
      new_paid_amount?: number
      new_status?: string
    }

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to record payment' }
    }

    return {
      success: true,
      data: {
        newPaidAmount: result.new_paid_amount,
        newStatus: result.new_status,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
