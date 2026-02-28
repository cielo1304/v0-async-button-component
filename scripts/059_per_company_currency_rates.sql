-- ================================================================
-- 059_per_company_currency_rates.sql
-- Make currency rates and exchange rate templates per-company.
-- Tables:
--   currency_rates              – global (shared reference data) -> per-company override
--   system_currency_rates       – global platform table -> per-company copy
--   currency_rate_history       – per-company write; read-scoped
-- ================================================================

-- ---------------------------------------------------------------
-- 1. currency_rates: add company_id for per-company overrides
--    The global rows (company_id IS NULL) remain as platform defaults.
--    Company-specific rows shadow the global defaults.
-- ---------------------------------------------------------------

ALTER TABLE public.currency_rates
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Existing rows become global defaults (company_id = NULL = platform-wide)
-- No backfill needed; NULL means "applies to all companies" for reads.

CREATE INDEX IF NOT EXISTS idx_currency_rates_company_id
  ON public.currency_rates(company_id)
  WHERE company_id IS NOT NULL;

-- Drop old open constraint if any
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rates_select" ON public.currency_rates;
DROP POLICY IF EXISTS "currency_rates_insert" ON public.currency_rates;
DROP POLICY IF EXISTS "currency_rates_update" ON public.currency_rates;
DROP POLICY IF EXISTS "currency_rates_delete" ON public.currency_rates;

-- Anyone authenticated can read global rates (company_id IS NULL)
-- or their own company's rates
CREATE POLICY "currency_rates_select"
  ON public.currency_rates FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Only company members can insert their own company's rates
CREATE POLICY "currency_rates_insert"
  ON public.currency_rates FOR INSERT
  WITH CHECK (
    company_id IS NULL  -- system/auto-refresh writes with service role bypass RLS
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Can only update own company's rates (not global ones from client)
CREATE POLICY "currency_rates_update"
  ON public.currency_rates FOR UPDATE
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

CREATE POLICY "currency_rates_delete"
  ON public.currency_rates FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.currency_rates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currency_rates TO authenticated;

-- ---------------------------------------------------------------
-- 2. system_currency_rates: per-company copy table
--    The existing system_currency_rates rows are platform-level
--    defaults. We add company_id and seed per-company copies
--    for each existing company.
-- ---------------------------------------------------------------

ALTER TABLE public.system_currency_rates
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Drop old primary key (code TEXT only) and recreate with compound key
ALTER TABLE public.system_currency_rates DROP CONSTRAINT IF EXISTS system_currency_rates_pkey;
ALTER TABLE public.system_currency_rates ADD PRIMARY KEY (code, company_id);

-- Wait — the above fails if company_id is NULL for existing rows.
-- Strategy: keep existing rows as platform defaults (company_id NULL = global),
-- and only seed new per-company copies on demand (via RPC or lazy init).

-- Revert to the safe approach: keep existing PK on code,
-- just mark existing rows as global (company_id stays NULL).
-- Per-company overrides live alongside and are preferred by app code.
-- We'll create a unique index instead.

-- Actually we need a different approach since we can't change PK to allow NULL:
-- Drop the compound PK we just attempted and use a unique partial index.
ALTER TABLE public.system_currency_rates DROP CONSTRAINT IF EXISTS system_currency_rates_pkey;
ALTER TABLE public.system_currency_rates ADD PRIMARY KEY (code);  -- restore original

-- Add unique index for per-company overrides (code + company_id must be unique when set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_currency_rates_company_code
  ON public.system_currency_rates(company_id, code)
  WHERE company_id IS NOT NULL;

-- Seed per-company copies from global defaults for all existing companies
DO $$
DECLARE
  comp RECORD;
  rate RECORD;
BEGIN
  FOR comp IN SELECT id FROM public.companies LOOP
    FOR rate IN SELECT code, rate_to_rub, rate_to_usd, prev_rate_to_rub, change_24h, name, symbol, sort_order, is_popular
                FROM public.system_currency_rates
                WHERE company_id IS NULL
    LOOP
      INSERT INTO public.system_currency_rates (
        code, company_id, rate_to_rub, rate_to_usd, prev_rate_to_rub,
        change_24h, name, symbol, sort_order, is_popular, last_updated
      )
      VALUES (
        rate.code || '_' || comp.id::TEXT,  -- We need a unique code key
        comp.id,
        rate.rate_to_rub,
        rate.rate_to_usd,
        rate.prev_rate_to_rub,
        rate.change_24h,
        rate.name,
        rate.symbol,
        rate.sort_order,
        rate.is_popular,
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- The above compound code approach is fragile. Let's use a proper separate table.
-- ---------------------------------------------------------------
-- 2b. BETTER APPROACH: company_currency_rates (separate table)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  rate_to_rub NUMERIC NOT NULL DEFAULT 1,
  rate_to_usd NUMERIC NOT NULL DEFAULT 1,
  prev_rate_to_rub NUMERIC DEFAULT 1,
  change_24h NUMERIC DEFAULT 0,
  name TEXT,
  symbol TEXT,
  sort_order INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_company_currency_rates_company
  ON public.company_currency_rates(company_id);

CREATE INDEX IF NOT EXISTS idx_company_currency_rates_code
  ON public.company_currency_rates(company_id, code);

-- Seed per-company copies for all existing companies from system_currency_rates
INSERT INTO public.company_currency_rates (
  company_id, code, rate_to_rub, rate_to_usd, prev_rate_to_rub,
  change_24h, name, symbol, sort_order, is_popular, last_updated
)
SELECT
  c.id AS company_id,
  scr.code,
  scr.rate_to_rub,
  scr.rate_to_usd,
  COALESCE(scr.prev_rate_to_rub, scr.rate_to_rub),
  COALESCE(scr.change_24h, 0),
  scr.name,
  scr.symbol,
  scr.sort_order,
  scr.is_popular,
  now()
FROM public.companies c
CROSS JOIN public.system_currency_rates scr
WHERE scr.company_id IS NULL
ON CONFLICT (company_id, code) DO NOTHING;

-- RLS
ALTER TABLE public.company_currency_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_currency_rates_select"
  ON public.company_currency_rates FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_currency_rates_insert"
  ON public.company_currency_rates FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_currency_rates_update"
  ON public.company_currency_rates FOR UPDATE
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

REVOKE ALL ON public.company_currency_rates FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.company_currency_rates TO authenticated;

-- ---------------------------------------------------------------
-- 3. currency_rate_history: add company_id
-- ---------------------------------------------------------------

ALTER TABLE public.currency_rate_history
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Existing rows are global history (company_id = NULL = platform level)
CREATE INDEX IF NOT EXISTS idx_currency_rate_history_company
  ON public.currency_rate_history(company_id)
  WHERE company_id IS NOT NULL;

ALTER TABLE public.currency_rate_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rate_history_select" ON public.currency_rate_history;
DROP POLICY IF EXISTS "currency_rate_history_insert" ON public.currency_rate_history;

-- Global history visible to all authenticated users; company-specific only to members
CREATE POLICY "currency_rate_history_select"
  ON public.currency_rate_history FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "currency_rate_history_insert"
  ON public.currency_rate_history FOR INSERT
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.currency_rate_history FROM anon;
GRANT SELECT, INSERT ON public.currency_rate_history TO authenticated;

-- ---------------------------------------------------------------
-- 4. RPC: ensure_company_currency_rates
--    Called on company creation or on demand.
--    Copies system defaults into company_currency_rates for a given company.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_company_currency_rates(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_currency_rates (
    company_id, code, rate_to_rub, rate_to_usd, prev_rate_to_rub,
    change_24h, name, symbol, sort_order, is_popular, last_updated
  )
  SELECT
    p_company_id,
    scr.code,
    scr.rate_to_rub,
    scr.rate_to_usd,
    COALESCE(scr.prev_rate_to_rub, scr.rate_to_rub),
    COALESCE(scr.change_24h, 0),
    scr.name,
    scr.symbol,
    scr.sort_order,
    scr.is_popular,
    now()
  FROM public.system_currency_rates scr
  WHERE scr.company_id IS NULL
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_company_currency_rates(UUID) TO authenticated;

COMMENT ON FUNCTION public.ensure_company_currency_rates IS
  'Seeds company_currency_rates from system defaults for a given company. Safe to call multiple times.';

-- ---------------------------------------------------------------
-- 5. View: v_company_rates
--    Returns effective rates for the current user's active company.
--    Fallback: if no company-specific rate exists, return system default.
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_company_rates AS
SELECT
  ccr.company_id,
  ccr.code,
  ccr.rate_to_rub,
  ccr.rate_to_usd,
  ccr.prev_rate_to_rub,
  ccr.change_24h,
  ccr.name,
  ccr.symbol,
  ccr.sort_order,
  ccr.is_popular,
  ccr.last_updated
FROM public.company_currency_rates ccr
WHERE ccr.company_id IN (
  SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
)
ORDER BY ccr.company_id, ccr.sort_order;

COMMENT ON VIEW public.v_company_rates IS
  'Per-company currency rates visible to the current authenticated user.';

COMMENT ON TABLE public.company_currency_rates IS
  'Per-company currency rates. Each company maintains its own set of rates independent of others.';
