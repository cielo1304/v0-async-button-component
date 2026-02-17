-- =============================================================
-- Migration 050: Assets module hardening
--   1. Add company_id to assets + asset_locations
--   2. Enable RLS on all 5 assets tables
--   3. Tenant-isolation policies matching exchange pattern
--   4. Add ASSET_SALE to transactions category constraint
-- =============================================================

-- -----------------------------------------------
-- 1. Add company_id columns (nullable for backcompat)
-- -----------------------------------------------
ALTER TABLE assets ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE asset_locations ADD COLUMN IF NOT EXISTS company_id UUID;

CREATE INDEX IF NOT EXISTS idx_assets_company ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_locations_company ON asset_locations(company_id);

-- -----------------------------------------------
-- 2. Enable RLS on all asset tables
-- -----------------------------------------------
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_location_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_sale_events ENABLE ROW LEVEL SECURITY;

-- Revoke direct access from anon
REVOKE ALL ON assets FROM anon;
REVOKE ALL ON asset_locations FROM anon;
REVOKE ALL ON asset_location_moves FROM anon;
REVOKE ALL ON asset_valuations FROM anon;
REVOKE ALL ON asset_sale_events FROM anon;

-- -----------------------------------------------
-- 3a. Policies for `assets` (direct company_id)
-- -----------------------------------------------
DROP POLICY IF EXISTS "assets_select_by_company" ON assets;
CREATE POLICY "assets_select_by_company" ON assets FOR SELECT USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_insert_by_company" ON assets;
CREATE POLICY "assets_insert_by_company" ON assets FOR INSERT WITH CHECK (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_update_by_company" ON assets;
CREATE POLICY "assets_update_by_company" ON assets FOR UPDATE
USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_delete_by_company" ON assets;
CREATE POLICY "assets_delete_by_company" ON assets FOR DELETE USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- -----------------------------------------------
-- 3b. Policies for `asset_locations` (direct company_id)
-- -----------------------------------------------
DROP POLICY IF EXISTS "asset_locations_select_by_company" ON asset_locations;
CREATE POLICY "asset_locations_select_by_company" ON asset_locations FOR SELECT USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "asset_locations_insert_by_company" ON asset_locations;
CREATE POLICY "asset_locations_insert_by_company" ON asset_locations FOR INSERT WITH CHECK (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "asset_locations_update_by_company" ON asset_locations;
CREATE POLICY "asset_locations_update_by_company" ON asset_locations FOR UPDATE
USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- -----------------------------------------------
-- 3c. Policies for child tables (via asset_id -> assets)
-- -----------------------------------------------
DROP POLICY IF EXISTS "asset_location_moves_select" ON asset_location_moves;
CREATE POLICY "asset_location_moves_select" ON asset_location_moves FOR SELECT USING (
  asset_id IN (SELECT id FROM assets)
);

DROP POLICY IF EXISTS "asset_location_moves_insert" ON asset_location_moves;
CREATE POLICY "asset_location_moves_insert" ON asset_location_moves FOR INSERT WITH CHECK (
  asset_id IN (SELECT id FROM assets)
);

DROP POLICY IF EXISTS "asset_valuations_select" ON asset_valuations;
CREATE POLICY "asset_valuations_select" ON asset_valuations FOR SELECT USING (
  asset_id IN (SELECT id FROM assets)
);

DROP POLICY IF EXISTS "asset_valuations_insert" ON asset_valuations;
CREATE POLICY "asset_valuations_insert" ON asset_valuations FOR INSERT WITH CHECK (
  asset_id IN (SELECT id FROM assets)
);

DROP POLICY IF EXISTS "asset_sale_events_select" ON asset_sale_events;
CREATE POLICY "asset_sale_events_select" ON asset_sale_events FOR SELECT USING (
  asset_id IN (SELECT id FROM assets)
);

DROP POLICY IF EXISTS "asset_sale_events_insert" ON asset_sale_events;
CREATE POLICY "asset_sale_events_insert" ON asset_sale_events FOR INSERT WITH CHECK (
  asset_id IN (SELECT id FROM assets)
);

-- -----------------------------------------------
-- 4. Expand transactions category constraint to include ASSET_SALE
-- -----------------------------------------------
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check
  CHECK (category = ANY (ARRAY[
    'DEPOSIT','WITHDRAW','DEAL_PAYMENT','EXPENSE','SALARY',
    'EXCHANGE_OUT','EXCHANGE_IN','TRANSFER_OUT','TRANSFER_IN',
    'CLIENT_EXCHANGE_IN','CLIENT_EXCHANGE_OUT',
    'ASSET_SALE'
  ]));
