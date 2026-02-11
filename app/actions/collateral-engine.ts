'use server'

import { createServerClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

// ─── evaluateCollateral ─────────────────────────────────────
// Snapshot valuation + LTV at moment of pledge or re-evaluation
export async function evaluateCollateral(params: {
  collateralLinkId: string
  financeDealId: string
  principalOutstanding: number
  actorEmployeeId?: string
}) {
  const supabase = await createServerClient()

  try {
    // Get collateral link with asset
    const { data: link, error: linkErr } = await supabase
      .from('finance_collateral_links')
      .select('*, asset:assets(id, title)')
      .eq('id', params.collateralLinkId)
      .single()
    if (linkErr || !link) return { success: false, error: 'Залоговая связь не найдена' }

    // Get latest valuation for the asset
    const { data: val } = await supabase
      .from('asset_valuations')
      .select('base_amount')
      .eq('asset_id', link.asset_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const valuation = val?.base_amount ? Number(val.base_amount) : 0
    const ltv = valuation > 0 && params.principalOutstanding > 0
      ? Number(((params.principalOutstanding / valuation) * 100).toFixed(2))
      : null

    const { error: upErr } = await supabase
      .from('finance_collateral_links')
      .update({
        valuation_at_pledge: valuation,
        ltv_at_pledge: ltv,
      })
      .eq('id', params.collateralLinkId)

    if (upErr) return { success: false, error: upErr.message }

    await writeAuditLog(supabase, {
      action: 'collateral_evaluate',
      module: 'finance',
      entityTable: 'finance_collateral_links',
      entityId: params.collateralLinkId,
      after: { valuation, ltv },
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.financeDealId}`)
    return { success: true, valuation, ltv, message: `Оценка: ${valuation.toLocaleString()}, LTV: ${ltv ?? '—'}%` }
  } catch {
    return { success: false, error: 'Ошибка оценки залога' }
  }
}

// ─── replaceCollateral ──────────────────────────────────────
// Replace old asset with new one; write chain record, update link statuses, update asset statuses
export async function replaceCollateral(params: {
  financeDealId: string
  oldCollateralLinkId: string
  newAssetId: string
  reason?: string
  pledgedUnits?: number
  actorEmployeeId?: string
}) {
  const supabase = await createServerClient()

  try {
    // 1. End old link
    const { data: oldLink, error: olErr } = await supabase
      .from('finance_collateral_links')
      .select('asset_id')
      .eq('id', params.oldCollateralLinkId)
      .single()
    if (olErr || !oldLink) return { success: false, error: 'Старая залоговая связь не найдена' }

    await supabase.from('finance_collateral_links')
      .update({ status: 'replaced', ended_at: new Date().toISOString() })
      .eq('id', params.oldCollateralLinkId)

    // 2. Release old asset
    await supabase.from('assets')
      .update({ status: 'released' })
      .eq('id', oldLink.asset_id)

    // 3. Create new link
    const { data: newLink, error: nlErr } = await supabase.from('finance_collateral_links')
      .insert({
        finance_deal_id: params.financeDealId,
        asset_id: params.newAssetId,
        status: 'active',
        started_at: new Date().toISOString(),
        pledged_units: params.pledgedUnits ?? null,
      })
      .select()
      .single()
    if (nlErr) return { success: false, error: nlErr.message }

    // 4. Mark new asset as pledged
    await supabase.from('assets')
      .update({ status: 'pledged' })
      .eq('id', params.newAssetId)

    // If divisible, decrement available_units
    if (params.pledgedUnits) {
      const { data: asset } = await supabase
        .from('assets')
        .select('available_units')
        .eq('id', params.newAssetId)
        .single()
      if (asset?.available_units != null) {
        await supabase.from('assets')
          .update({ available_units: Number(asset.available_units) - params.pledgedUnits })
          .eq('id', params.newAssetId)
      }
    }

    // 5. Write chain record
    await supabase.from('finance_collateral_chain').insert({
      finance_deal_id: params.financeDealId,
      old_asset_id: oldLink.asset_id,
      new_asset_id: params.newAssetId,
      reason: params.reason || 'Замена залога',
      created_by_employee_id: params.actorEmployeeId || null,
    })

    // 6. Audit
    await writeAuditLog(supabase, {
      action: 'collateral_replace',
      module: 'finance',
      entityTable: 'finance_collateral_links',
      entityId: newLink.id,
      before: { old_asset_id: oldLink.asset_id },
      after: { new_asset_id: params.newAssetId, reason: params.reason },
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.financeDealId}`)
    revalidatePath(`/assets/${oldLink.asset_id}`)
    revalidatePath(`/assets/${params.newAssetId}`)
    return { success: true, message: 'Залог заменён' }
  } catch {
    return { success: false, error: 'Ошибка замены залога' }
  }
}

// ─── defaultWithSideEffects ─────────────────────────────────
// Set deal to DEFAULT, mark all active collateral as foreclosed, update asset statuses
export async function defaultWithSideEffects(params: {
  coreDealId: string
  financeDealId: string
  actorEmployeeId?: string
}) {
  const supabase = await createServerClient()

  try {
    // 1. Update deal status
    await supabase.from('core_deals')
      .update({ status: 'DEFAULT', sub_status: 'foreclosure' })
      .eq('id', params.coreDealId)

    // 2. Get all active collateral links
    const { data: activeLinks } = await supabase
      .from('finance_collateral_links')
      .select('id, asset_id')
      .eq('finance_deal_id', params.financeDealId)
      .eq('status', 'active')

    if (activeLinks && activeLinks.length > 0) {
      // 3. Mark all as foreclosed
      const linkIds = activeLinks.map(l => l.id)
      await supabase.from('finance_collateral_links')
        .update({ status: 'foreclosed', ended_at: new Date().toISOString() })
        .in('id', linkIds)

      // 4. Update asset statuses
      const assetIds = activeLinks.map(l => l.asset_id)
      await supabase.from('assets')
        .update({ status: 'foreclosed' })
        .in('id', assetIds)

      // 5. Write ledger entries for each foreclosed asset (collateral_proceed)
      for (const link of activeLinks) {
        const { data: val } = await supabase
          .from('asset_valuations')
          .select('base_amount, base_currency')
          .eq('asset_id', link.asset_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (val) {
          await supabase.from('finance_ledger').insert({
            finance_deal_id: params.financeDealId,
            entry_type: 'collateral_proceed',
            occurred_at: new Date().toISOString(),
            amount: Number(val.base_amount),
            currency: val.base_currency,
            base_amount: Number(val.base_amount),
            base_currency: val.base_currency,
            allocation: {},
            note: `Обращение залога (актив ${link.asset_id.slice(0, 8)})`,
            created_by_employee_id: params.actorEmployeeId || null,
            visibility_mode: 'restricted',
            allowed_role_codes: ['owner', 'finance_admin'],
            client_audience_notes: {},
          })
        }
      }
    }

    // 6. Audit
    await writeAuditLog(supabase, {
      action: 'default_with_foreclosure',
      module: 'finance',
      entityTable: 'core_deals',
      entityId: params.coreDealId,
      after: { status: 'DEFAULT', foreclosed_assets: activeLinks?.length || 0 },
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.coreDealId}`)
    return {
      success: true,
      message: `Дефолт: обращено ${activeLinks?.length || 0} залогов`,
      foreclosedCount: activeLinks?.length || 0,
    }
  } catch {
    return { success: false, error: 'Ошибка при дефолте' }
  }
}

// ─── releaseCollateral ──────────────────────────────────────
export async function releaseCollateral(params: {
  collateralLinkId: string
  financeDealId: string
  actorEmployeeId?: string
}) {
  const supabase = await createServerClient()

  try {
    const { data: link } = await supabase
      .from('finance_collateral_links')
      .select('asset_id, pledged_units')
      .eq('id', params.collateralLinkId)
      .single()
    if (!link) return { success: false, error: 'Связь не найдена' }

    await supabase.from('finance_collateral_links')
      .update({ status: 'released', ended_at: new Date().toISOString() })
      .eq('id', params.collateralLinkId)

    // Check if asset has other active pledges
    const { count } = await supabase
      .from('finance_collateral_links')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', link.asset_id)
      .eq('status', 'active')
      .neq('id', params.collateralLinkId)

    if (!count || count === 0) {
      await supabase.from('assets')
        .update({ status: 'released' })
        .eq('id', link.asset_id)
    }

    // Restore available_units if divisible
    if (link.pledged_units) {
      const { data: asset } = await supabase
        .from('assets')
        .select('available_units')
        .eq('id', link.asset_id)
        .single()
      if (asset?.available_units != null) {
        await supabase.from('assets')
          .update({ available_units: Number(asset.available_units) + Number(link.pledged_units) })
          .eq('id', link.asset_id)
      }
    }

    await writeAuditLog(supabase, {
      action: 'collateral_release',
      module: 'finance',
      entityTable: 'finance_collateral_links',
      entityId: params.collateralLinkId,
      after: { asset_id: link.asset_id },
      actorEmployeeId: params.actorEmployeeId,
    })

    revalidatePath(`/finance-deals/${params.financeDealId}`)
    revalidatePath(`/assets/${link.asset_id}`)
    return { success: true, message: 'Залог освобождён' }
  } catch {
    return { success: false, error: 'Ошибка освобождения залога' }
  }
}
