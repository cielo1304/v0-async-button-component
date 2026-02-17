# Variant D: Assets Sale + God Mode Actor + RLS/company_id Migration

## Files Changed

### Migration
- `scripts/050_assets_rls_company_id.sql` — NEW
  - Adds `company_id` UUID column to `assets` and `asset_locations` tables
  - Enables RLS on all 5 asset tables (`assets`, `asset_locations`, `asset_location_moves`, `asset_valuations`, `asset_sale_events`)
  - Creates tenant-isolation policies matching the exchange tables pattern (via `team_members.user_id = auth.uid()`)
  - Child tables (`asset_location_moves`, `asset_valuations`, `asset_sale_events`) use `asset_id IN (SELECT id FROM assets)` for RLS
  - Adds `ASSET_SALE` to `transactions_category_check` constraint

### Server Actions
- `app/actions/assets.ts` — MODIFIED
  - Added `getCashboxesList()` — fetches cashboxes for the sale dialog selector
  - Added `recordAssetSale()` — full sale flow:
    1. Validates asset exists and is not sold/written_off
    2. Inserts `asset_sale_events` record
    3. Optionally calls `cashbox_operation` RPC with category `ASSET_SALE` (positive amount = income)
    4. Updates asset status to `sold`
    5. Writes audit log

### UI
- `app/assets/[id]/page.tsx` — MODIFIED
  - Added `GodModeActorSelector` to valuation, move, and sale dialogs
  - Added Sale dialog with fields: sale amount/currency, base amount/currency, fx rate, cashbox selector, comment
  - Added "Продажа" button in header (hidden when asset is `sold` or `written_off`)
  - Cashboxes list loaded in parallel with other data
  - `godmodeActorId` flows into all 3 action handlers (valuation, move, sale)

- `app/assets/page.tsx` — MODIFIED
  - Added `GodModeActorSelector` to the create asset dialog
  - `godmodeActorId` passed as `responsible_employee_id` override in `createAsset`

## Acceptance Checklist

- [ ] Run `scripts/050_assets_rls_company_id.sql` in Supabase SQL editor
- [ ] Create a new asset -> verify GodModeActorSelector appears in create dialog
- [ ] Open asset detail -> add valuation -> verify god-mode actor is used
- [ ] Open asset detail -> add move -> verify god-mode actor is used
- [ ] Open asset detail (status != sold/written_off) -> click "Продажа" -> fill sale form
  - Without cashbox: only sale event + status change
  - With cashbox: sale event + cashbox_operation (ASSET_SALE category) + status change
- [ ] Verify "Продажа" button is hidden for sold/written_off assets
- [ ] Verify sale events appear in the Overview tab table
