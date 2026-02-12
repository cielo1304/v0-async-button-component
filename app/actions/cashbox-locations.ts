'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CashboxLocation } from '@/lib/types/database'

export async function getCashboxLocations() {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('cashbox_locations')
    .select('*')
    .order('sort_order')
  
  if (error) {
    console.error('[v0] getCashboxLocations error:', error)
    return []
  }
  
  return data as CashboxLocation[]
}

export async function createCashboxLocation(input: { name: string; description?: string; sort_order?: number }) {
  const supabase = await createServerClient()
  
  try {
    const { data, error } = await supabase
      .from('cashbox_locations')
      .insert({
        name: input.name,
        description: input.description || null,
        sort_order: input.sort_order ?? 0,
        is_active: true,
      })
      .select()
      .single()
    
    if (error) throw error
    
    revalidatePath('/finance')
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка создания локации' }
  }
}

export async function updateCashboxLocation(id: string, input: { name?: string; description?: string; sort_order?: number; is_active?: boolean }) {
  const supabase = await createServerClient()
  
  try {
    const { error } = await supabase
      .from('cashbox_locations')
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      })
      .eq('id', id)
    
    if (error) throw error
    
    revalidatePath('/finance')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка обновления локации' }
  }
}

export async function deleteCashboxLocation(id: string) {
  const supabase = await createServerClient()
  
  try {
    const { error } = await supabase
      .from('cashbox_locations')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    revalidatePath('/finance')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка удаления локации' }
  }
}
