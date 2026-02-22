'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import type { CashboxLocation } from '@/lib/types/database'

// ─── Fetch all cashbox locations ───

export async function getCashboxLocations() {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { data, error } = await supabase
      .from('cashbox_locations')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error

    return { success: true, data: data as CashboxLocation[] }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch cashbox locations' }
  }
}

// ─── Create cashbox location ───

export async function createCashboxLocation(input: {
  name: string
  description?: string
  sort_order?: number
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { data, error } = await supabase
      .from('cashbox_locations')
      .insert({
        name: input.name,
        description: input.description || null,
        sort_order: input.sort_order || 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/finance')
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create cashbox location' }
  }
}

// ─── Update cashbox location ───

export async function updateCashboxLocation(
  locationId: string,
  input: {
    name?: string
    description?: string
    sort_order?: number
    is_active?: boolean
  }
) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { data, error } = await supabase
      .from('cashbox_locations')
      .update({
        name: input.name,
        description: input.description,
        sort_order: input.sort_order,
        is_active: input.is_active,
      })
      .eq('id', locationId)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/finance')
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update cashbox location' }
  }
}

// ─── Delete cashbox location ───

export async function deleteCashboxLocation(locationId: string) {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    const { error } = await supabase
      .from('cashbox_locations')
      .delete()
      .eq('id', locationId)

    if (error) throw error

    revalidatePath('/finance')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete cashbox location' }
  }
}
