'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { writeAuditLog } from '@/lib/audit'

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
 * @deprecated Use recordAutoPaymentV2 instead for cashbox integration
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

/**
 * Record a payment for an auto deal V2
 * ATOMIC: Creates transaction via cashbox_operation_v2, updates auto_payments and auto_deals
 * Full audit trail and God Mode support
 */
export async function recordAutoPaymentV2(params: {
  dealId: string
  cashboxId: string
  amount: number
  currency: string
  schedulePaymentId?: string
  note?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    const { data: paymentId, error } = await supabase.rpc('auto_record_payment_v2', {
      p_deal_id: params.dealId,
      p_cashbox_id: params.cashboxId,
      p_amount: params.amount,
      p_currency: params.currency,
      p_schedule_payment_id: params.schedulePaymentId || null,
      p_note: params.note || null,
      p_actor_employee_id: params.actorEmployeeId || null,
    })

    if (error) {
      console.error('[v0] recordAutoPaymentV2 error:', error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: { paymentId },
    }
  } catch (err) {
    console.error('[v0] recordAutoPaymentV2 exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Create auto deal V2 - Server-side creation with cashbox integration
 * No client-side inserts, all operations through server actions and RPC
 */
export async function createAutoDealV2(params: {
  carId: string
  buyerId?: string
  sellerId?: string
  dealType: string
  salePrice?: number
  currency: string
  rentPriceDaily?: number
  rentStartDate?: string
  rentEndDate?: string
  commissionMode?: string
  commissionFixedAmount?: number
  description?: string
  // Installment fields
  installmentMonths?: number
  installmentMonthlyPayment?: number
  installmentStartDate?: string
  // Initial payment
  initialPayment?: number
  cashboxId?: string
  // Actor
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const supabase = await createClient()

    // Generate deal number
    const dealNumber = `DEAL-${Date.now()}`

    // Get contact IDs from auto_clients if available
    let buyerContactId: string | null = null
    let sellerContactId: string | null = null

    if (params.buyerId) {
      const { data: buyerClient } = await supabase
        .from('auto_clients')
        .select('contact_id')
        .eq('id', params.buyerId)
        .single()
      buyerContactId = buyerClient?.contact_id || null
    }

    if (params.sellerId) {
      const { data: sellerClient } = await supabase
        .from('auto_clients')
        .select('contact_id')
        .eq('id', params.sellerId)
        .single()
      sellerContactId = sellerClient?.contact_id || null
    }

    // Create auto_deals record
    const dealData: any = {
      deal_number: dealNumber,
      car_id: params.carId,
      buyer_id: params.buyerId || null,
      seller_id: params.sellerId || null,
      buyer_contact_id: buyerContactId,
      seller_contact_id: sellerContactId,
      deal_type: params.dealType,
      currency: params.currency,
      sale_currency: params.currency,
      status: 'NEW',
      contract_date: new Date().toISOString().split('T')[0],
      total_paid: 0,
      total_debt: 0,
    }

    // Add sale price
    if (params.salePrice) {
      dealData.sale_price = params.salePrice
      dealData.total_amount = params.salePrice
      dealData.total_debt = params.salePrice
    }

    // Add rental fields
    if (params.dealType === 'RENT' || params.dealType === 'RENTAL') {
      dealData.rent_price_daily = params.rentPriceDaily
      dealData.rent_start_date = params.rentStartDate
      dealData.rent_end_date = params.rentEndDate
      // Also set old fields for compatibility
      dealData.daily_rate = params.rentPriceDaily
      dealData.rental_start_date = params.rentStartDate
      dealData.rental_end_date = params.rentEndDate
    }

    // Add commission fields
    if (params.commissionMode) {
      dealData.commission_mode = params.commissionMode
      if (params.commissionFixedAmount) {
        dealData.commission_fixed_amount = params.commissionFixedAmount
      }
    }

    const { data: deal, error: dealError } = await supabase
      .from('auto_deals')
      .insert(dealData)
      .select()
      .single()

    if (dealError) {
      console.error('[v0] createAutoDealV2 deal insert error:', dealError)
      return { success: false, error: dealError.message }
    }

    // Create payment schedule for INSTALLMENT
    if (params.dealType === 'INSTALLMENT' && params.installmentMonths && params.installmentMonthlyPayment) {
      const payments = []
      const startDate = new Date(params.installmentStartDate || new Date())

      for (let i = 1; i <= params.installmentMonths; i++) {
        const scheduledDate = new Date(startDate)
        scheduledDate.setMonth(scheduledDate.getMonth() + i - 1)
        const dateStr = scheduledDate.toISOString().split('T')[0]

        payments.push({
          deal_id: deal.id,
          payment_number: i,
          payment_type: 'INSTALLMENT',
          direction: 'IN',
          amount: params.installmentMonthlyPayment,
          currency: params.currency,
          scheduled_date: dateStr,
          due_date: dateStr,
          paid_amount: 0,
          status: 'PENDING',
        })
      }

      const { error: paymentsError } = await supabase.from('auto_payments').insert(payments)

      if (paymentsError) {
        console.error('[v0] createAutoDealV2 payments insert error:', paymentsError)
      }
    }

    // Process initial payment if provided
    if (params.initialPayment && params.initialPayment > 0 && params.cashboxId) {
      const paymentResult = await supabase.rpc('auto_record_payment_v2', {
        p_deal_id: deal.id,
        p_cashbox_id: params.cashboxId,
        p_amount: params.initialPayment,
        p_currency: params.currency,
        p_schedule_payment_id: null,
        p_note: 'Initial payment',
        p_actor_employee_id: params.actorEmployeeId || null,
      })

      if (paymentResult.error) {
        console.error('[v0] createAutoDealV2 initial payment error:', paymentResult.error)
      }
    }

    // Update car status
    let carStatus = 'IN_STOCK'
    let platformStatus = 'AVAILABLE'

    if (params.dealType === 'RENT' || params.dealType === 'RENTAL') {
      carStatus = 'RENTED'
      platformStatus = 'RENTED'
    } else if (params.dealType === 'CASH_SALE' || params.dealType === 'COMMISSION_SALE' || params.dealType === 'INSTALLMENT') {
      carStatus = 'SOLD'
      platformStatus = 'RESERVED'
    }

    await supabase
      .from('cars')
      .update({ status: carStatus, platform_status: platformStatus })
      .eq('id', params.carId)

    // Write audit log
    await writeAuditLog({
      module: 'auto',
      action: 'auto_deal_create',
      entityTable: 'auto_deals',
      entityId: deal.id,
      after: {
        deal_number: dealNumber,
        car_id: params.carId,
        deal_type: params.dealType,
        sale_price: params.salePrice,
        currency: params.currency,
      },
      actorEmployeeId: params.actorEmployeeId,
    })

    // Revalidate paths
    revalidatePath('/cars')
    revalidatePath('/cars/deals')

    return {
      success: true,
      data: {
        dealId: deal.id,
        dealNumber: dealNumber,
      },
    }
  } catch (err) {
    console.error('[v0] createAutoDealV2 exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
