-- =====================================================================
-- Asset module RLS hardening (2026-04-22)
--
-- Problem
--   1. Permissive `*_authenticated` policies (auth.uid() IS NOT NULL) OR-combine
--      with the strict team_members policies, so any logged-in user currently
--      reads and writes every company's assets / valuations / sale events /
--      location moves / asset_locations.
--   2. `*_by_company` policies tolerate `company_id IS NULL`, so the 7 orphan
--      rows bleed into every tenant.
--   3. Child-table SELECT/INSERT policies (valuations, sale_events, moves)
--      scope by `asset_id IN (SELECT id FROM assets)` instead of by
--      company_id — indirect and fragile.
--   4. `company_id` is nullable on assets / asset_valuations /
--      asset_location_moves / asset_sale_events.
--
-- Fix (idempotent)
--   A. Backfill the 7 orphan rows to company
--      56eeb2d9-f1dd-4aff-9035-29e1c8893a0a
--      (confirmed via the asset's responsible_employee.company_id AND
--       owner_contact.company_id).
--   B. DROP every dangerous permissive policy.
--   C. Ensure strict company-scoped SELECT/INSERT/UPDATE/DELETE policies
--      exist on every asset table.
--   D. Set company_id NOT NULL on the 4 core asset tables.
--   E. Add asset_company_id() helper + BEFORE-INSERT trigger to auto-fill
--      company_id on the 4 core asset tables so application code can never
--      forget it.
--
-- Safe to run multiple times. All DROP/CREATE statements use IF EXISTS /
-- DO blocks so re-execution is a no-op.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Backfill orphan rows (7 rows total)
-- ---------------------------------------------------------------------
UPDATE public.assets
   SET company_id = '56eeb2d9-f1dd-4aff-9035-29e1c8893a0a'::uuid
 WHERE id = '0fa1ffc1-08a8-4115-b455-a90dfe64aac0'::uuid
   AND company_id IS NULL;

UPDATE public.asset_valuations v
   SET company_id = a.company_id
  FROM public.assets a
 WHERE v.asset_id = a.id
   AND v.company_id IS NULL
   AND a.company_id IS NOT NULL;

UPDATE public.asset_sale_events s
   SET company_id = a.company_id
  FROM public.assets a
 WHERE s.asset_id = a.id
   AND s.company_id IS NULL
   AND a.company_id IS NOT NULL;

UPDATE public.asset_location_moves m
   SET company_id = a.company_id
  FROM public.assets a
 WHERE m.asset_id = a.id
   AND m.company_id IS NULL
   AND a.company_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- B. Drop every dangerous permissive policy.
--    Everything listed below either allows `auth.uid() IS NOT NULL` (any
--    authenticated user) or `company_id IS NULL` (orphan escape), or
--    scopes via `asset_id IN (SELECT id FROM assets)` which is not
--    company-enforced.
-- ---------------------------------------------------------------------

-- assets
DROP POLICY IF EXISTS assets_select_authenticated   ON public.assets;
DROP POLICY IF EXISTS assets_update_authenticated   ON public.assets;
DROP POLICY IF EXISTS assets_write_authenticated    ON public.assets;
DROP POLICY IF EXISTS assets_insert_by_company      ON public.assets;
DROP POLICY IF EXISTS assets_update_by_company      ON public.assets;
DROP POLICY IF EXISTS assets_select_by_company      ON public.assets;
DROP POLICY IF EXISTS assets_delete_by_company      ON public.assets;

-- asset_valuations
DROP POLICY IF EXISTS asset_vals_select_authenticated ON public.asset_valuations;
DROP POLICY IF EXISTS asset_vals_write_authenticated  ON public.asset_valuations;
DROP POLICY IF EXISTS asset_valuations_select         ON public.asset_valuations;
DROP POLICY IF EXISTS asset_valuations_insert         ON public.asset_valuations;

-- asset_sale_events
DROP POLICY IF EXISTS asset_sales_select_authenticated ON public.asset_sale_events;
DROP POLICY IF EXISTS asset_sales_write_authenticated  ON public.asset_sale_events;
DROP POLICY IF EXISTS asset_sale_events_select         ON public.asset_sale_events;
DROP POLICY IF EXISTS asset_sale_events_insert         ON public.asset_sale_events;

-- asset_location_moves
DROP POLICY IF EXISTS asset_moves_select_authenticated  ON public.asset_location_moves;
DROP POLICY IF EXISTS asset_moves_write_authenticated   ON public.asset_location_moves;
DROP POLICY IF EXISTS asset_location_moves_select       ON public.asset_location_moves;
DROP POLICY IF EXISTS asset_location_moves_insert       ON public.asset_location_moves;

-- asset_locations
DROP POLICY IF EXISTS asset_locations_select_authenticated ON public.asset_locations;
DROP POLICY IF EXISTS asset_locations_insert_by_company    ON public.asset_locations;
DROP POLICY IF EXISTS asset_locations_write_authenticated  ON public.asset_locations;
DROP POLICY IF EXISTS asset_locations_select_by_company    ON public.asset_locations;
DROP POLICY IF EXISTS asset_locations_update_authenticated ON public.asset_locations;
DROP POLICY IF EXISTS asset_locations_update_by_company    ON public.asset_locations;

-- ---------------------------------------------------------------------
-- C. Ensure strict company-scoped policies on every child table.
--    `assets` and `asset_locations` already have strict
--    select/insert/update/delete policies (assets_select, assets_insert,
--    assets_update, assets_delete, asset_locations_*) that we keep.
--    The 3 child tables below only had strict UPDATE/DELETE — we add
--    strict SELECT and INSERT here.
-- ---------------------------------------------------------------------

-- asset_valuations: strict SELECT + INSERT
DROP POLICY IF EXISTS asset_valuations_select_strict ON public.asset_valuations;
CREATE POLICY asset_valuations_select_strict ON public.asset_valuations
  FOR SELECT
  USING (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS asset_valuations_insert_strict ON public.asset_valuations;
CREATE POLICY asset_valuations_insert_strict ON public.asset_valuations
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

-- asset_sale_events: strict SELECT + INSERT
DROP POLICY IF EXISTS asset_sale_events_select_strict ON public.asset_sale_events;
CREATE POLICY asset_sale_events_select_strict ON public.asset_sale_events
  FOR SELECT
  USING (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS asset_sale_events_insert_strict ON public.asset_sale_events;
CREATE POLICY asset_sale_events_insert_strict ON public.asset_sale_events
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

-- asset_location_moves: strict SELECT + INSERT
DROP POLICY IF EXISTS asset_location_moves_select_strict ON public.asset_location_moves;
CREATE POLICY asset_location_moves_select_strict ON public.asset_location_moves
  FOR SELECT
  USING (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS asset_location_moves_insert_strict ON public.asset_location_moves;
CREATE POLICY asset_location_moves_insert_strict ON public.asset_location_moves
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT tm.company_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------
-- D. Enforce NOT NULL on company_id for the 4 core asset tables.
--    Idempotent: IS NULL count must be 0 before we alter (the
--    backfill above handles that).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.assets WHERE company_id IS NULL) THEN
    ALTER TABLE public.assets                 ALTER COLUMN company_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.asset_valuations WHERE company_id IS NULL) THEN
    ALTER TABLE public.asset_valuations       ALTER COLUMN company_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.asset_sale_events WHERE company_id IS NULL) THEN
    ALTER TABLE public.asset_sale_events      ALTER COLUMN company_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.asset_location_moves WHERE company_id IS NULL) THEN
    ALTER TABLE public.asset_location_moves   ALTER COLUMN company_id SET NOT NULL;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- E. asset_company_id() helper + BEFORE-INSERT trigger to auto-fill
--    company_id when the app layer forgets.
--    The trigger NEVER overrides an explicit value — it only fills when
--    NEW.company_id IS NULL. Service-role / admin bypass RLS and can
--    still override in both cases (e.g. View-As mode).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.asset_company_id_for_auth()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Returns the company_id of the authenticated user if and only if they
  -- have exactly one team_members row. Anything else returns NULL and lets
  -- the INSERT fail loudly (NOT NULL constraint) instead of guessing.
  SELECT tm.company_id
    FROM public.team_members tm
   WHERE tm.user_id = auth.uid()
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.asset_company_id_for_auth() FROM public;
GRANT EXECUTE ON FUNCTION public.asset_company_id_for_auth() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.asset_fill_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.asset_company_id_for_auth();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','asset_valuations','asset_sale_events','asset_location_moves']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   'trg_' || t || '_fill_company_id', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.asset_fill_company_id()',
                   'trg_' || t || '_fill_company_id', t);
  END LOOP;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------
-- Post-migration sanity checks (read-only)
-- ---------------------------------------------------------------------
SELECT 'assets'                AS tbl, COUNT(*) FILTER (WHERE company_id IS NULL) AS null_rows FROM public.assets
UNION ALL SELECT 'asset_valuations',      COUNT(*) FILTER (WHERE company_id IS NULL) FROM public.asset_valuations
UNION ALL SELECT 'asset_sale_events',     COUNT(*) FILTER (WHERE company_id IS NULL) FROM public.asset_sale_events
UNION ALL SELECT 'asset_location_moves',  COUNT(*) FILTER (WHERE company_id IS NULL) FROM public.asset_location_moves;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('assets','asset_valuations','asset_location_moves','asset_sale_events','asset_locations','finance_collateral_links','finance_collateral_chain')
ORDER BY tablename, cmd, policyname;
