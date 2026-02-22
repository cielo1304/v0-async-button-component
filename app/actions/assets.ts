'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { writeAuditLog } from '@/lib/audit'
import type { AssetType, AssetStatus } from '@/lib/types/database'

export async function getAssets(filters?: {
  showAll?: boolean
  assetType?: string
  search?: string
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  let query = supabase
    .from('assets')
    .select(`
      *,
      owner_contact:contacts!owner_contact_id(id, display_name),
      responsible_employee:employees!responsible_employee_id(id, full_name)
    `)
    .order('updated_at', { ascending: false })

  if (!filters?.showAll) {
    query = query.in('status', ['pledged', 'on_sale', 'foreclosed', 'moved_to_cars_stock', 'in_stock', 'company_owned'])
  }

  if (filters?.assetType && filters.assetType !== 'all') {
    query = query.eq('asset_type', filters.assetType)
  }

  if (filters?.search) {
    query = query.ilike('title', `%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)

  // Fetch latest valuation for each asset
  if (data && data.length > 0) {
    const assetIds = data.map((a) => a.id)
    const { data: valuations } = await supabase
      .from('asset_valuations')
      .select('*')
      .in('asset_id', assetIds)
      .order('created_at', { ascending: false })

    const latestValuationMap = new Map<string, (typeof valuations)[0]>()
    for (const v of valuations || []) {
      if (!latestValuationMap.has(v.asset_id)) {
        latestValuationMap.set(v.asset_id, v)
      }
    }

    // Fetch latest location for each asset
    const { data: moves } = await supabase
      .from('asset_location_moves')
      .select(`
        *,
        to_location:asset_locations!to_location_id(id, name)
      `)
      .in('asset_id', assetIds)
      .order('moved_at', { ascending: false })

    const latestLocationMap = new Map<string, string>()
    for (const m of moves || []) {
      if (!latestLocationMap.has(m.asset_id) && m.to_location) {
        latestLocationMap.set(m.asset_id, (m.to_location as { name: string }).name)
      }
    }

    // Fetch collateral links
    const { data: collateralLinks } = await supabase
      .from('finance_collateral_links')
      .select('asset_id, finance_deal_id, status')
      .in('asset_id', assetIds)
      .eq('status', 'active')

    const collateralMap = new Map<string, string>()
    for (const cl of collateralLinks || []) {
      collateralMap.set(cl.asset_id, cl.finance_deal_id)
    }

    return data.map((asset) => ({
      ...asset,
      latest_valuation: latestValuationMap.get(asset.id) || null,
      current_location_name: latestLocationMap.get(asset.id) || null,
      linked_finance_deal_id: collateralMap.get(asset.id) || null,
    }))
  }

  return data || []
}

export async function getAssetById(id: string) {
  const { supabase } = await createSupabaseAndRequireUser()

  const { data, error } = await supabase
    .from('assets')
    .select(`
      *,
      owner_contact:contacts!owner_contact_id(id, display_name),
      responsible_employee:employees!responsible_employee_id(id, full_name)
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getAssetValuations(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('asset_valuations')
    .select('*, created_by_employee:employees!created_by_employee_id(id, full_name)')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetMoves(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('asset_location_moves')
    .select(`
      *,
      from_location:asset_locations!from_location_id(id, name),
      to_location:asset_locations!to_location_id(id, name),
      moved_by_employee:employees!moved_by_employee_id(id, full_name)
    `)
    .eq('asset_id', assetId)
    .order('moved_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetCollateralLinks(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('finance_collateral_links')
    .select('*, finance_deal:finance_deals!finance_deal_id(id, core_deal_id, principal_amount, contract_currency, core_deal:core_deals!core_deal_id(title, status))')
    .eq('asset_id', assetId)
    .order('started_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetCollateralChain(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  // Get chain entries where this asset was either old or new
  const { data, error } = await supabase
    .from('finance_collateral_chain')
    .select('*, old_asset:assets!finance_collateral_chain_old_asset_id_fkey(id, title), new_asset:assets!finance_collateral_chain_new_asset_id_fkey(id, title)')
    .or(`old_asset_id.eq.${assetId},new_asset_id.eq.${assetId}`)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetSaleEvents(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('asset_sale_events')
    .select('*, created_by_employee:employees!created_by_employee_id(id, full_name)')
    .eq('asset_id', assetId)
    .order('sold_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetTimeline(assetId: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('v_timeline_asset_events')
    .select('*')
    .eq('asset_id', assetId)
    .order('event_time', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAssetLocations() {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('asset_locations')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return data || []
}

export async function getEmployeesList() {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')
  if (error) throw new Error(error.message)
  return data || []
}

export async function getContactsList(search?: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  let query = supabase.from('contacts').select('id, display_name').order('display_name').limit(50)
  if (search) {
    query = query.ilike('display_name', `%${search}%`)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function createAsset(formData: {
  asset_type: AssetType
  title: string
  status: AssetStatus
  owner_contact_id?: string | null
  responsible_employee_id?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
  actor_employee_id?: string | null
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  const { data, error } = await supabase
    .from('assets')
    .insert({
      asset_type: formData.asset_type,
      title: formData.title,
      status: formData.status,
      owner_contact_id: formData.owner_contact_id || null,
      responsible_employee_id: formData.responsible_employee_id || null,
      notes: formData.notes || null,
      metadata: formData.metadata || {},
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await writeAuditLog(supabase, {
    actorEmployeeId: formData.actor_employee_id,
    action: 'create',
    module: 'assets',
    entityTable: 'assets',
    entityId: data.id,
    after: data,
  })

  return data
}

export async function updateAsset(
  id: string,
  formData: {
    title?: string
    status?: AssetStatus
    asset_type?: AssetType
    owner_contact_id?: string | null
    responsible_employee_id?: string | null
    notes?: string | null
    metadata?: Record<string, unknown>
    visibility_mode?: 'public' | 'restricted'
    allowed_role_codes?: string[]
    client_audience_notes?: Record<string, unknown>
    actor_employee_id?: string | null
  }
) {
  const { supabase } = await createSupabaseAndRequireUser()

  // Get before state
  const { data: before } = await supabase.from('assets').select('*').eq('id', id).single()

  const updateData: Record<string, unknown> = {}
  if (formData.title !== undefined) updateData.title = formData.title
  if (formData.status !== undefined) updateData.status = formData.status
  if (formData.asset_type !== undefined) updateData.asset_type = formData.asset_type
  if (formData.owner_contact_id !== undefined) updateData.owner_contact_id = formData.owner_contact_id || null
  if (formData.responsible_employee_id !== undefined) updateData.responsible_employee_id = formData.responsible_employee_id || null
  if (formData.notes !== undefined) updateData.notes = formData.notes
  if (formData.metadata !== undefined) updateData.metadata = formData.metadata
  if (formData.visibility_mode !== undefined) updateData.visibility_mode = formData.visibility_mode
  if (formData.allowed_role_codes !== undefined) updateData.allowed_role_codes = formData.allowed_role_codes
  if (formData.client_audience_notes !== undefined) updateData.client_audience_notes = formData.client_audience_notes

  const { data, error } = await supabase.from('assets').update(updateData).eq('id', id).select().single()

  if (error) throw new Error(error.message)

  await writeAuditLog(supabase, {
    actorEmployeeId: formData.actor_employee_id,
    action: 'update',
    module: 'assets',
    entityTable: 'assets',
    entityId: id,
    before,
    after: data,
  })

  return data
}

export async function addAssetValuation(formData: {
  asset_id: string
  valuation_amount: number
  valuation_currency: string
  base_amount: number
  base_currency: string
  fx_rate?: number | null
  source_note?: string | null
  created_by_employee_id?: string | null
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  const { data, error } = await supabase
    .from('asset_valuations')
    .insert(formData)
    .select()
    .single()

  if (error) throw new Error(error.message)

  await writeAuditLog(supabase, {
    actorEmployeeId: formData.created_by_employee_id,
    action: 'valuation',
    module: 'assets',
    entityTable: 'asset_valuations',
    entityId: data.id,
    after: data,
  })

  return data
}

export async function addAssetMove(formData: {
  asset_id: string
  from_location_id?: string | null
  to_location_id?: string | null
  moved_by_employee_id?: string | null
  note?: string | null
}) {
  const { supabase } = await createSupabaseAndRequireUser()

  const { data, error } = await supabase
    .from('asset_location_moves')
    .insert(formData)
    .select()
    .single()

  if (error) throw new Error(error.message)

  await writeAuditLog(supabase, {
    actorEmployeeId: formData.moved_by_employee_id,
    action: 'move',
    module: 'assets',
    entityTable: 'asset_location_moves',
    entityId: data.id,
    after: data,
  })

  return data
}

export async function getCashboxesList() {
  const { supabase } = await createSupabaseAndRequireUser()
  const { data, error } = await supabase
    .from('cashboxes')
    .select('id, name, currency, balance')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function recordAssetSale(formData: {
  asset_id: string
  sale_amount: number
  sale_currency: string
  base_amount: number
  base_currency: string
  fx_rate?: number | null
  cashbox_id?: string | null
  created_by_employee_id?: string | null
  note?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await createSupabaseAndRequireUser()

  try {
    // 1. Verify asset exists and is not already sold
    const { data: asset, error: assetErr } = await supabase
      .from('assets')
      .select('id, title, status')
      .eq('id', formData.asset_id)
      .single()

    if (assetErr || !asset) return { success: false, error: 'Asset not found' }
    if (asset.status === 'sold') return { success: false, error: 'Asset is already sold' }
    if (asset.status === 'written_off') return { success: false, error: 'Asset is written off' }

    // 2. Insert sale event
    const { data: saleEvent, error: saleErr } = await supabase
      .from('asset_sale_events')
      .insert({
        asset_id: formData.asset_id,
        sale_amount: formData.sale_amount,
        sale_currency: formData.sale_currency,
        base_amount: formData.base_amount,
        base_currency: formData.base_currency,
        fx_rate: formData.fx_rate ?? null,
        created_by_employee_id: formData.created_by_employee_id ?? null,
      })
      .select()
      .single()

    if (saleErr) throw saleErr

    // 3. If cashbox specified, record income via cashbox_operation
    if (formData.cashbox_id) {
      if (!formData.created_by_employee_id) {
        return { success: false, error: 'Actor/employee required for cashbox operation' }
      }
      const { error: rpcErr } = await supabase.rpc('cashbox_operation', {
        p_cashbox_id: formData.cashbox_id,
        p_amount: formData.sale_amount,
        p_category: 'ASSET_SALE',
        p_description: formData.note || `Asset sale: ${asset.title} - ${formData.sale_amount} ${formData.sale_currency}`,
        p_reference_id: saleEvent.id,
        p_created_by: formData.created_by_employee_id,
      })

      if (rpcErr) throw rpcErr
    }

    // 4. Update asset status to 'sold'
    const { error: updateErr } = await supabase
      .from('assets')
      .update({ status: 'sold' })
      .eq('id', formData.asset_id)

    if (updateErr) throw updateErr

    // 5. Audit log
    await writeAuditLog(supabase, {
      actorEmployeeId: formData.created_by_employee_id,
      action: 'sale',
      module: 'assets',
      entityTable: 'asset_sale_events',
      entityId: saleEvent.id,
      after: {
        ...saleEvent,
        cashbox_id: formData.cashbox_id,
        note: formData.note,
      },
    })

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error recording asset sale'
    return { success: false, error: message }
  }
}
