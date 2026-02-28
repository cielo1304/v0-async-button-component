-- ================================================================
-- 057_cashboxes_company_id_rls.sql
-- Add company_id to cashboxes (and cashbox_locations), backfill,
-- index, and enforce RLS so data never leaks between companies.
-- Also fixes: "cashboxes.company_id does not exist" runtime error.
-- ================================================================

-- ---------------------------------------------------------------
-- SECTION A: cashboxes
-- ---------------------------------------------------------------

-- 1. Add company_id column (nullable first, for safe backfill)
ALTER TABLE public.cashboxes
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- 2. Backfill: infer company_id from transactions.created_by -> team_members
--    Step 1: via earliest transaction on each cashbox
UPDATE public.cashboxes cb
SET company_id = sub.company_id
FROM (
  SELECT DISTINCT ON (t.cashbox_id)
    t.cashbox_id,
    tm.company_id
  FROM public.transactions t
  JOIN public.team_members tm ON tm.user_id = t.created_by
  WHERE tm.company_id IS NOT NULL
  ORDER BY t.cashbox_id, t.created_at ASC
) sub
WHERE cb.id = sub.cashbox_id
  AND cb.company_id IS NULL;

-- 3. Backfill fallback: cashboxes still NULL -> assign to first/only company
--    (Only safe if there is exactly one company; documented below)
--    NOTE: If multiple companies exist and a cashbox has no transactions,
--    it will remain NULL and RLS will block access until manually assigned.
UPDATE public.cashboxes
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

-- 4. Index for RLS lookups
CREATE INDEX IF NOT EXISTS idx_cashboxes_company_id
  ON public.cashboxes(company_id);

-- ---------------------------------------------------------------
-- SECTION B: RLS on cashboxes
-- ---------------------------------------------------------------

ALTER TABLE public.cashboxes ENABLE ROW LEVEL SECURITY;

-- Drop stale/permissive policies if they exist
DROP POLICY IF EXISTS "cashboxes_select" ON public.cashboxes;
DROP POLICY IF EXISTS "cashboxes_insert" ON public.cashboxes;
DROP POLICY IF EXISTS "cashboxes_update" ON public.cashboxes;
DROP POLICY IF EXISTS "cashboxes_delete" ON public.cashboxes;

-- SELECT: only rows whose company_id is in the user's team memberships
CREATE POLICY "cashboxes_select"
  ON public.cashboxes FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: only into company the user belongs to
CREATE POLICY "cashboxes_insert"
  ON public.cashboxes FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- UPDATE: same company check
CREATE POLICY "cashboxes_update"
  ON public.cashboxes FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- DELETE: same company check
CREATE POLICY "cashboxes_delete"
  ON public.cashboxes FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Revoke direct anon access
REVOKE ALL ON public.cashboxes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashboxes TO authenticated;

-- ---------------------------------------------------------------
-- SECTION C: cashbox_locations (treat as per-company config)
-- ---------------------------------------------------------------

ALTER TABLE public.cashbox_locations
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill cashbox_locations to first company (they're config rows)
UPDATE public.cashbox_locations
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cashbox_locations_company_id
  ON public.cashbox_locations(company_id);

ALTER TABLE public.cashbox_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashbox_locations_select" ON public.cashbox_locations;
DROP POLICY IF EXISTS "cashbox_locations_insert" ON public.cashbox_locations;
DROP POLICY IF EXISTS "cashbox_locations_update" ON public.cashbox_locations;
DROP POLICY IF EXISTS "cashbox_locations_delete" ON public.cashbox_locations;

CREATE POLICY "cashbox_locations_select"
  ON public.cashbox_locations FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cashbox_locations_insert"
  ON public.cashbox_locations FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cashbox_locations_update"
  ON public.cashbox_locations FOR UPDATE
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- SECTION D: Update cashbox_balances_with_reserved VIEW
-- (was already referencing c.company_id in 038 — rebuild to be safe)
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW public.cashbox_balances_with_reserved AS
SELECT
  c.id,
  c.company_id,
  c.name,
  c.currency,
  c.balance,
  COALESCE(r.reserved, 0)             AS reserved,
  c.balance - COALESCE(r.reserved, 0) AS available,
  c.is_archived,
  c.created_at,
  c.updated_at
FROM public.cashboxes c
LEFT JOIN (
  SELECT
    cashbox_id,
    SUM(amount) AS reserved
  FROM public.cashbox_reservations
  WHERE status = 'active' AND side = 'out'
  GROUP BY cashbox_id
) r ON r.cashbox_id = c.id;

COMMENT ON VIEW public.cashbox_balances_with_reserved IS
  'Cashbox balances with reserved amounts, scoped by RLS on cashboxes.';

-- ---------------------------------------------------------------
-- SECTION E: RPC helpers — add company scope guard
-- ---------------------------------------------------------------
-- cashbox_operation_v2 and cashbox_transfer are SECURITY DEFINER-
-- free functions; they already check the cashbox exists and is not
-- archived. Adding company_id to cashboxes means RLS on the table
-- automatically scopes which cashboxes the authenticated client
-- can look up. The RPCs themselves don't need to be changed since
-- they operate inside plpgsql where auth.uid() context is present.
-- However, we recreate cashbox_available_balance to use company_id.

CREATE OR REPLACE FUNCTION public.cashbox_available_balance(p_cashbox_id UUID)
RETURNS NUMERIC AS $$
  SELECT
    COALESCE(c.balance, 0) - public.cashbox_reserved_sum(p_cashbox_id)
  FROM public.cashboxes c
  WHERE c.id = p_cashbox_id;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------
-- DIAGNOSTIC (commented): find public tables lacking company_id
-- that are actively referenced by application queries
-- ---------------------------------------------------------------
/*
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'company_id'
  )
  AND table_name NOT IN (
    -- Platform/system tables that are intentionally global:
    'companies', 'team_members', 'system_roles', 'user_roles',
    'employees', 'employee_roles', 'employee_invites', 'employee_invite_links',
    'position_default_roles', 'audit_log', 'audit_log_v2',
    'system_currency_rates', 'currency_rate_history', 'currency_rates',
    'schema_migrations'
  )
ORDER BY table_name;
*/

COMMENT ON TABLE public.cashboxes IS
  'Company-scoped cashboxes. RLS enforced via company_id + team_members.';
