'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { revalidatePath } from 'next/cache'
import { writeAuditLog } from '@/lib/audit'
import { updateContact } from '@/app/actions/contacts'

export interface AutoActionResult {
  success: boolean
  error?: string
  data?: any
}

/**
 * Record an expense for a car V2
 * ATOMIC: Creates transaction via cashbox_operation_v2, updates auto_expenses and recalculates P&L
 * Full audit trail and God Mode support
 */
export async function recordAutoExpenseV2(params: {
  carId: string
  dealId?: string
  cashboxId?: string
  amount: number
  currency: string
  type: string
  description?: string
  paidBy?: 'COMPANY' | 'OWNER' | 'SHARED'
  ownerShare?: number
  actorEmployeeId?: string
  expenseDate?: string
}): Promise<AutoActionResult> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    // Build RPC args - only include p_expense_date if provided
    const rpcArgs: any = {
      p_car_id: params.carId,
      p_deal_id: params.dealId || null,
      p_cashbox_id: params.cashboxId || null,
      p_amount: params.amount,
      p_currency: params.currency,
      p_type: params.type,
      p_description: params.description || null,
      p_paid_by: params.paidBy || 'COMPANY',
      p_owner_share: params.ownerShare || 0,
      p_actor_employee_id: params.actorEmployeeId || null,
    }

    // Only add p_expense_date if explicitly provided
    if (params.expenseDate) {
      rpcArgs.p_expense_date = params.expenseDate
    }

    const { data: expenseId, error } = await supabase.rpc('auto_record_expense_v2', rpcArgs)

    if (error) {
      console.error('[v0] recordAutoExpenseV2 error:', error)
      return { success: false, error: error.message }
    }

    // Revalidate paths
    revalidatePath('/cars')
    revalidatePath('/cars/deals')
    revalidatePath(`/cars/${params.carId}`)
    if (params.dealId) {
      revalidatePath(`/cars/deals/${params.dealId}`)
    }

    return {
      success: true,
      data: { expenseId },
    }
  } catch (err) {
    console.error('[v0] recordAutoExpenseV2 exception:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Create a purchase record for a car
 * Records the purchase in auto_ledger as negative expense
 */
export async function createAutoPurchase(params: {
  carId: string
  purchaseAmount: number
  supplierName?: string
  description?: string
  actorEmployeeId?: string
}): Promise<AutoActionResult> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase.rpc('auto_record_purchase_v1', {
      p_car_id: params.carId,
      p_purchase_amount: params.purchaseAmount,
      p_supplier_name: params.supplierName || null,
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
    const { supabase } = await createSupabaseAndRequireUser()

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
    const { supabase } = await createSupabaseAndRequireUser()

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
    const { supabase } = await createSupabaseAndRequireUser()

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
    const { supabase } = await createSupabaseAndRequireUser()

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
  buyerContactId?: string  // Direct contact_id from ContactPicker
  sellerId?: string
  sellerContactId?: string // Direct contact_id from ContactPicker
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
    const { supabase } = await createSupabaseAndRequireUser()

    // Generate deal number
    const dealNumber = `DEAL-${Date.now()}`

    // Get contact IDs: prefer direct contactId from ContactPicker, fallback to auto_clients lookup
    let buyerContactId: string | null = params.buyerContactId || null
    let sellerContactId: string | null = params.sellerContactId || null

    if (!buyerContactId && params.buyerId) {
      const { data: buyerClient } = await supabase
        .from('auto_clients')
        .select('contact_id')
        .eq('id', params.buyerId)
        .single()
      buyerContactId = buyerClient?.contact_id || null
    }

    if (!sellerContactId && params.sellerId) {
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

/**
 * Update auto client's personal data through the linked contact.
 * Writes name/phone/nickname changes to contacts table,
 * and syncs full_name/phone back to auto_clients for backward compat.
 */
export async function updateAutoClientContact(params: {
  autoClientId: string
  first_name?: string
  last_name?: string
  nickname?: string
  mobile_phone?: string
  organization?: string
  email?: string
}): Promise<AutoActionResult> {
  try {
    await requireUser()
    const supabase = await createClient()

    // Get auto_client with contact_id
    const { data: ac, error: acErr } = await supabase
      .from('auto_clients')
      .select('id, contact_id, full_name, phone')
      .eq('id', params.autoClientId)
      .single()

    if (acErr || !ac) return { success: false, error: 'Автоклиент не найден' }

    let contactId = ac.contact_id

    // If no contact linked, create one
    if (!contactId) {
      const { data: newContact, error: cErr } = await supabase
        .from('contacts')
        .insert({
          first_name: params.first_name || ac.full_name,
          last_name: params.last_name || null,
          nickname: params.nickname || null,
          mobile_phone: params.mobile_phone || ac.phone || null,
          organization: params.organization || null,
        })
        .select('id')
        .single()

      if (cErr || !newContact) return { success: false, error: 'Не удалось создать контакт' }
      contactId = newContact.id

      await supabase
        .from('auto_clients')
        .update({ contact_id: contactId })
        .eq('id', ac.id)
    } else {
      // Update existing contact
      const updatePayload: Record<string, any> = {}
      if (params.first_name !== undefined) updatePayload.first_name = params.first_name
      if (params.last_name !== undefined) updatePayload.last_name = params.last_name
      if (params.nickname !== undefined) updatePayload.nickname = params.nickname
      if (params.mobile_phone !== undefined) updatePayload.mobile_phone = params.mobile_phone
      if (params.organization !== undefined) updatePayload.organization = params.organization

      // Recompute display_name
      const fn = (params.first_name ?? '').trim()
      const ln = (params.last_name ?? '').trim()
      const nick = (params.nickname ?? '').trim()
      let displayName = [fn, ln].filter(Boolean).join(' ') || 'Без имени'
      if (nick) displayName += ` (${nick})`
      updatePayload.display_name = displayName

      const { error: updateErr } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contactId)

      if (updateErr) return { success: false, error: updateErr.message }
    }

    // Sync back to auto_clients for backward compat
    const syncData: Record<string, any> = {}
    const fn = (params.first_name ?? '').trim()
    const ln = (params.last_name ?? '').trim()
    if (fn || ln) syncData.full_name = [fn, ln].filter(Boolean).join(' ')
    if (params.mobile_phone !== undefined) syncData.phone = params.mobile_phone
    if (params.email !== undefined) syncData.email = params.email

    if (Object.keys(syncData).length > 0) {
      await supabase.from('auto_clients').update(syncData).eq('id', ac.id)
    }

    revalidatePath('/cars')
    revalidatePath(`/cars/clients/${ac.id}`)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
