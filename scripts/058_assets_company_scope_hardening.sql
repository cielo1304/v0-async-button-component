-- =============================================================
-- Migration 058: Assets module — company scope hardening
--
-- Fixes A/B cross-company duplication reported in Assets.
--
-- Root causes addressed:
--   1. RLS escape hatch `company_id IS NULL OR ...` on assets and
--      asset_locations let legacy NULL-company rows leak to every tenant.
--   2. Child tables (asset_valuations, asset_location_moves,
--      asset_sale_events, finance_collateral_links,
--      finance_collateral_chain) had NO company_id column, so
--      they could not be filtered explicitly; their policies delegated
--      to `assets` and inherited the NULL-company loophole.
--   3. View `v_timeline_asset_events` did not expose company_id, so the
--      app-level filter `.eq('company_id', companyId)` was impossible.
--
-- This migration:
--   - Adds company_id to all asset-related child tables
--   - Backfills company_id from the parent `assets` row
--   - Replaces the leaky RLS policies with strict, direct company_id
--     filters on every table
--   - Rebuilds v_timeline_asset_events so it exposes company_id
--
-- ADD-ONLY with one exception: we DROP and recreate the v_timeline_asset_events
-- view (view shape change) and replace the existing assets / asset_locations
-- / child policies. No tables are dropped, no data is destroyed.
-- =============================================================

-- -----------------------------------------------
-- 1. Add company_id to child tables
-- -----------------------------------------------
ALTER TABLE asset_valuations        ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE asset_location_moves    ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE asset_sale_events       ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE finance_collateral_links  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE finance_collateral_chain  ADD COLUMN IF NOT EXISTS company_id UUID;

CREATE INDEX IF NOT EXISTS idx_asset_valuations_company       ON asset_valuations(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_location_moves_company   ON asset_location_moves(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_sale_events_company      ON asset_sale_events(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_collateral_links_company  ON finance_collateral_links(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_collateral_chain_company  ON finance_collateral_chain(company_id);

-- -----------------------------------------------
-- 2. Backfill company_id on child tables from parent `assets`
-- -----------------------------------------------
UPDATE asset_valuations av
SET    company_id = a.company_id
FROM   assets a
WHERE  av.asset_id = a.id
  AND  av.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE asset_location_moves alm
SET    company_id = a.company_id
FROM   assets a
WHERE  alm.asset_id = a.id
  AND  alm.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE asset_sale_events ase
SET    company_id = a.company_id
FROM   assets a
WHERE  ase.asset_id = a.id
  AND  ase.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE finance_collateral_links fcl
SET    company_id = a.company_id
FROM   assets a
WHERE  fcl.asset_id = a.id
  AND  fcl.company_id IS NULL
  AND  a.company_id IS NOT NULL;

-- For collateral_chain both old/new should share company; use old_asset as source
UPDATE finance_collateral_chain fcc
SET    company_id = a.company_id
FROM   assets a
WHERE  fcc.old_asset_id = a.id
  AND  fcc.company_id IS NULL
  AND  a.company_id IS NOT NULL;

-- -----------------------------------------------
-- 3. Tighten RLS on `assets`: remove the NULL-company escape hatch
-- -----------------------------------------------
DROP POLICY IF EXISTS "assets_select_by_company" ON assets;
CREATE POLICY "assets_select_by_company" ON assets FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_insert_by_company" ON assets;
CREATE POLICY "assets_insert_by_company" ON assets FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_update_by_company" ON assets;
CREATE POLICY "assets_update_by_company" ON assets FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "assets_delete_by_company" ON assets;
CREATE POLICY "assets_delete_by_company" ON assets FOR DELETE USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- -----------------------------------------------
-- 4. Tighten RLS on `asset_locations`
-- -----------------------------------------------
DROP POLICY IF EXISTS "asset_locations_select_by_company" ON asset_locations;
CREATE POLICY "asset_locations_select_by_company" ON asset_locations FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "asset_locations_insert_by_company" ON asset_locations;
CREATE POLICY "asset_locations_insert_by_company" ON asset_locations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "asset_locations_update_by_company" ON asset_locations;
CREATE POLICY "asset_locations_update_by_company" ON asset_locations FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- -----------------------------------------------
-- 5. Replace child-table policies to filter directly by company_id
-- -----------------------------------------------
-- asset_valuations
DROP POLICY IF EXISTS "asset_valuations_select" ON asset_valuations;
DROP POLICY IF EXISTS "asset_valuations_insert" ON asset_valuations;
CREATE POLICY "asset_valuations_select_by_company" ON asset_valuations FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "asset_valuations_insert_by_company" ON asset_valuations FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "asset_valuations_update_by_company" ON asset_valuations FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- asset_location_moves
DROP POLICY IF EXISTS "asset_location_moves_select" ON asset_location_moves;
DROP POLICY IF EXISTS "asset_location_moves_insert" ON asset_location_moves;
CREATE POLICY "asset_location_moves_select_by_company" ON asset_location_moves FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "asset_location_moves_insert_by_company" ON asset_location_moves FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- asset_sale_events
DROP POLICY IF EXISTS "asset_sale_events_select" ON asset_sale_events;
DROP POLICY IF EXISTS "asset_sale_events_insert" ON asset_sale_events;
CREATE POLICY "asset_sale_events_select_by_company" ON asset_sale_events FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "asset_sale_events_insert_by_company" ON asset_sale_events FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- finance_collateral_links (asset-side read from Assets module)
ALTER TABLE finance_collateral_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_collateral_links FROM anon;
DROP POLICY IF EXISTS "finance_collateral_links_select_by_company" ON finance_collateral_links;
DROP POLICY IF EXISTS "finance_collateral_links_insert_by_company" ON finance_collateral_links;
DROP POLICY IF EXISTS "finance_collateral_links_update_by_company" ON finance_collateral_links;
DROP POLICY IF EXISTS "finance_collateral_links_delete_by_company" ON finance_collateral_links;
CREATE POLICY "finance_collateral_links_select_by_company" ON finance_collateral_links FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "finance_collateral_links_insert_by_company" ON finance_collateral_links FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "finance_collateral_links_update_by_company" ON finance_collateral_links FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "finance_collateral_links_delete_by_company" ON finance_collateral_links FOR DELETE USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- finance_collateral_chain (asset-side read from Assets module)
ALTER TABLE finance_collateral_chain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_collateral_chain FROM anon;
DROP POLICY IF EXISTS "finance_collateral_chain_select_by_company" ON finance_collateral_chain;
DROP POLICY IF EXISTS "finance_collateral_chain_insert_by_company" ON finance_collateral_chain;
CREATE POLICY "finance_collateral_chain_select_by_company" ON finance_collateral_chain FOR SELECT USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "finance_collateral_chain_insert_by_company" ON finance_collateral_chain FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- -----------------------------------------------
-- 6. Rebuild v_timeline_asset_events to expose company_id
-- -----------------------------------------------
DROP VIEW IF EXISTS v_timeline_asset_events;
CREATE VIEW v_timeline_asset_events AS
-- Location moves
SELECT
  alm.moved_at AS event_time,
  'move' AS event_type,
  alm.id AS entity_id,
  alm.asset_id,
  alm.company_id,
  'Перемещение: ' || COALESCE(loc_from.name, '—') || ' -> ' || COALESCE(loc_to.name, '—') AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  alm.moved_by_employee_id AS created_by_employee_id
FROM asset_location_moves alm
LEFT JOIN asset_locations loc_from ON loc_from.id = alm.from_location_id
LEFT JOIN asset_locations loc_to   ON loc_to.id   = alm.to_location_id

UNION ALL

-- Valuations
SELECT
  av.created_at AS event_time,
  'valuation' AS event_type,
  av.id AS entity_id,
  av.asset_id,
  av.company_id,
  'Оценка: ' || av.valuation_amount || ' ' || av.valuation_currency AS title,
  av.valuation_amount AS amount,
  av.valuation_currency AS currency,
  av.created_by_employee_id
FROM asset_valuations av

UNION ALL

-- Collateral links
SELECT
  fcl.started_at AS event_time,
  'collateral_' || fcl.status AS event_type,
  fcl.id AS entity_id,
  fcl.asset_id,
  fcl.company_id,
  'Залог (' || fcl.status || ')' AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  NULL::uuid AS created_by_employee_id
FROM finance_collateral_links fcl

UNION ALL

-- Collateral chain (old side)
SELECT
  fcc.created_at AS event_time,
  'collateral_replace' AS event_type,
  fcc.id AS entity_id,
  fcc.old_asset_id AS asset_id,
  fcc.company_id,
  'Замена залога' AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  fcc.created_by_employee_id
FROM finance_collateral_chain fcc

UNION ALL

-- Sale events
SELECT
  ase.sold_at AS event_time,
  'sale' AS event_type,
  ase.id AS entity_id,
  ase.asset_id,
  ase.company_id,
  'Продажа: ' || ase.sale_amount || ' ' || ase.sale_currency AS title,
  ase.sale_amount AS amount,
  ase.sale_currency AS currency,
  ase.created_by_employee_id
FROM asset_sale_events ase;
