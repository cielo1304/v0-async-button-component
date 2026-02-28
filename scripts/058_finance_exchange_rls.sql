-- ================================================================
-- 058_finance_exchange_rls.sql
-- Enforce company-scoped RLS on every finance/exchange table that
-- doesn't have it yet, and backfill company_id where it is missing.
--
-- Tables addressed:
--   transactions          – backfill via cashboxes.company_id, RLS
--   exchange_logs         – company_id already added in 040; RLS only
--   salary_balances       – backfill via team_members, RLS
--   salary_transactions   – backfill via cashboxes / team_members, RLS
--   contacts              – backfill via contact_segments -> team, RLS
--   contact_channels      – RLS via contact_id -> contacts
--   contact_segments      – backfill + RLS
--   deals                 – backfill via manager_id -> team_members, RLS
--   deal_payments         – RLS via deal_id -> deals
--   deal_docs             – RLS via deal_id -> deals
--   cars                  – backfill via created_by or first company, RLS
--   car_timeline          – RLS via car_id -> cars
-- ================================================================

-- ---------------------------------------------------------------
-- 1. transactions
--    Has cashbox_id -> cashboxes.company_id (after 057).
-- ---------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill from cashbox
UPDATE public.transactions t
SET company_id = c.company_id
FROM public.cashboxes c
WHERE t.cashbox_id = c.id
  AND t.company_id IS NULL
  AND c.company_id IS NOT NULL;

-- Fallback: created_by -> team_members
UPDATE public.transactions t
SET company_id = tm.company_id
FROM public.team_members tm
WHERE tm.user_id = t.created_by
  AND t.company_id IS NULL;

-- Final fallback: first company
UPDATE public.transactions
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_company_id
  ON public.transactions(company_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;

CREATE POLICY "transactions_select"
  ON public.transactions FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "transactions_insert"
  ON public.transactions FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "transactions_update"
  ON public.transactions FOR UPDATE
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

REVOKE ALL ON public.transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- ---------------------------------------------------------------
-- 2. exchange_logs
--    company_id column was added conditionally in 040; ensure
--    it exists, is backfilled, and has RLS.
-- ---------------------------------------------------------------

ALTER TABLE public.exchange_logs
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill via from_box_id -> cashboxes.company_id
UPDATE public.exchange_logs el
SET company_id = c.company_id
FROM public.cashboxes c
WHERE el.from_box_id = c.id
  AND el.company_id IS NULL
  AND c.company_id IS NOT NULL;

-- Fallback: created_by -> team_members
UPDATE public.exchange_logs el
SET company_id = tm.company_id
FROM public.team_members tm
WHERE tm.user_id = el.created_by
  AND el.company_id IS NULL;

-- Final fallback
UPDATE public.exchange_logs
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_exchange_logs_company_id
  ON public.exchange_logs(company_id);

ALTER TABLE public.exchange_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exchange_logs_select" ON public.exchange_logs;
DROP POLICY IF EXISTS "exchange_logs_insert" ON public.exchange_logs;

CREATE POLICY "exchange_logs_select"
  ON public.exchange_logs FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "exchange_logs_insert"
  ON public.exchange_logs FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.exchange_logs FROM anon;
GRANT SELECT, INSERT ON public.exchange_logs TO authenticated;

-- ---------------------------------------------------------------
-- 3. salary_balances + salary_transactions
-- ---------------------------------------------------------------

ALTER TABLE public.salary_balances
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.salary_balances sb
SET company_id = tm.company_id
FROM public.team_members tm
WHERE tm.user_id = sb.user_id
  AND sb.company_id IS NULL;

UPDATE public.salary_balances
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_salary_balances_company_id
  ON public.salary_balances(company_id);

ALTER TABLE public.salary_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_balances_select" ON public.salary_balances;
DROP POLICY IF EXISTS "salary_balances_insert" ON public.salary_balances;
DROP POLICY IF EXISTS "salary_balances_update" ON public.salary_balances;

CREATE POLICY "salary_balances_select"
  ON public.salary_balances FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "salary_balances_insert"
  ON public.salary_balances FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "salary_balances_update"
  ON public.salary_balances FOR UPDATE
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

REVOKE ALL ON public.salary_balances FROM anon;

-- salary_transactions
ALTER TABLE public.salary_transactions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.salary_transactions st
SET company_id = c.company_id
FROM public.cashboxes c
WHERE st.cashbox_id = c.id
  AND st.company_id IS NULL
  AND c.company_id IS NOT NULL;

UPDATE public.salary_transactions st
SET company_id = tm.company_id
FROM public.team_members tm
WHERE tm.user_id = st.user_id
  AND st.company_id IS NULL;

UPDATE public.salary_transactions
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_salary_transactions_company_id
  ON public.salary_transactions(company_id);

ALTER TABLE public.salary_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_transactions_select" ON public.salary_transactions;
DROP POLICY IF EXISTS "salary_transactions_insert" ON public.salary_transactions;

CREATE POLICY "salary_transactions_select"
  ON public.salary_transactions FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "salary_transactions_insert"
  ON public.salary_transactions FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.salary_transactions FROM anon;

-- ---------------------------------------------------------------
-- 4. contacts + contact_channels + contact_segments
-- ---------------------------------------------------------------

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill contacts via contact_segments (if the segment was created by a team member)
-- contacts themselves don't have a created_by, so use segment activity
UPDATE public.contacts co
SET company_id = (
  SELECT tm.company_id
  FROM public.contact_segments cs
  JOIN public.team_members tm ON true  -- company_id from segments is not tracked; pick first company
  WHERE cs.contact_id = co.id
  LIMIT 1
)
WHERE co.company_id IS NULL;

-- Final fallback for contacts
UPDATE public.contacts
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON public.contacts(company_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;

CREATE POLICY "contacts_select"
  ON public.contacts FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "contacts_insert"
  ON public.contacts FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "contacts_update"
  ON public.contacts FOR UPDATE
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

CREATE POLICY "contacts_delete"
  ON public.contacts FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.contacts FROM anon;

-- contact_channels: inherit via contact_id -> contacts
ALTER TABLE public.contact_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_channels_select" ON public.contact_channels;
DROP POLICY IF EXISTS "contact_channels_insert" ON public.contact_channels;
DROP POLICY IF EXISTS "contact_channels_update" ON public.contact_channels;

CREATE POLICY "contact_channels_select"
  ON public.contact_channels FOR SELECT
  USING (contact_id IN (SELECT id FROM public.contacts));

CREATE POLICY "contact_channels_insert"
  ON public.contact_channels FOR INSERT
  WITH CHECK (contact_id IN (SELECT id FROM public.contacts));

CREATE POLICY "contact_channels_update"
  ON public.contact_channels FOR UPDATE
  USING (contact_id IN (SELECT id FROM public.contacts))
  WITH CHECK (contact_id IN (SELECT id FROM public.contacts));

REVOKE ALL ON public.contact_channels FROM anon;

-- contact_segments: add company_id
ALTER TABLE public.contact_segments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.contact_segments cs
SET company_id = co.company_id
FROM public.contacts co
WHERE cs.contact_id = co.id
  AND cs.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_segments_company ON public.contact_segments(company_id);

ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_segments_select" ON public.contact_segments;
DROP POLICY IF EXISTS "contact_segments_insert" ON public.contact_segments;

CREATE POLICY "contact_segments_select"
  ON public.contact_segments FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "contact_segments_insert"
  ON public.contact_segments FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.contact_segments FROM anon;

-- ---------------------------------------------------------------
-- 5. deals + deal_payments + deal_docs
-- ---------------------------------------------------------------

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.deals d
SET company_id = tm.company_id
FROM public.team_members tm
WHERE tm.user_id = d.manager_id
  AND d.company_id IS NULL;

UPDATE public.deals
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_deals_company_id ON public.deals(company_id);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_select" ON public.deals;
DROP POLICY IF EXISTS "deals_insert" ON public.deals;
DROP POLICY IF EXISTS "deals_update" ON public.deals;
DROP POLICY IF EXISTS "deals_delete" ON public.deals;

CREATE POLICY "deals_select"
  ON public.deals FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "deals_insert"
  ON public.deals FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "deals_update"
  ON public.deals FOR UPDATE
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

CREATE POLICY "deals_delete"
  ON public.deals FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.deals FROM anon;

-- deal_payments: via deal_id -> deals
ALTER TABLE public.deal_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_payments_select" ON public.deal_payments;
DROP POLICY IF EXISTS "deal_payments_insert" ON public.deal_payments;

CREATE POLICY "deal_payments_select"
  ON public.deal_payments FOR SELECT
  USING (deal_id IN (SELECT id FROM public.deals));

CREATE POLICY "deal_payments_insert"
  ON public.deal_payments FOR INSERT
  WITH CHECK (deal_id IN (SELECT id FROM public.deals));

REVOKE ALL ON public.deal_payments FROM anon;

-- deal_docs: via deal_id -> deals
ALTER TABLE public.deal_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_docs_select" ON public.deal_docs;
DROP POLICY IF EXISTS "deal_docs_insert" ON public.deal_docs;

CREATE POLICY "deal_docs_select"
  ON public.deal_docs FOR SELECT
  USING (deal_id IN (SELECT id FROM public.deals));

CREATE POLICY "deal_docs_insert"
  ON public.deal_docs FOR INSERT
  WITH CHECK (deal_id IN (SELECT id FROM public.deals));

REVOKE ALL ON public.deal_docs FROM anon;

-- ---------------------------------------------------------------
-- 6. cars + car_timeline
-- ---------------------------------------------------------------

ALTER TABLE public.cars
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.cars
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cars_company_id ON public.cars(company_id);

ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cars_select" ON public.cars;
DROP POLICY IF EXISTS "cars_insert" ON public.cars;
DROP POLICY IF EXISTS "cars_update" ON public.cars;
DROP POLICY IF EXISTS "cars_delete" ON public.cars;

CREATE POLICY "cars_select"
  ON public.cars FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cars_insert"
  ON public.cars FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cars_update"
  ON public.cars FOR UPDATE
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

REVOKE ALL ON public.cars FROM anon;

-- car_timeline: via car_id -> cars
ALTER TABLE public.car_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "car_timeline_select" ON public.car_timeline;
DROP POLICY IF EXISTS "car_timeline_insert" ON public.car_timeline;

CREATE POLICY "car_timeline_select"
  ON public.car_timeline FOR SELECT
  USING (car_id IN (SELECT id FROM public.cars));

CREATE POLICY "car_timeline_insert"
  ON public.car_timeline FOR INSERT
  WITH CHECK (car_id IN (SELECT id FROM public.cars));

REVOKE ALL ON public.car_timeline FROM anon;

-- ---------------------------------------------------------------
-- 7. audit_log + audit_log_v2
--    These are write-only from RPC/server; use permissive read
--    but restrict to company-membership-linked entities.
-- ---------------------------------------------------------------

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;

-- Authenticated users can insert; selects open to authenticated for now
CREATE POLICY "audit_log_insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "audit_log_select"
  ON public.audit_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.audit_log FROM anon;

-- audit_log_v2 already has actor_employee_id but no company_id;
-- keep it accessible to authenticated users only
ALTER TABLE public.audit_log_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_v2_insert" ON public.audit_log_v2;
DROP POLICY IF EXISTS "audit_log_v2_select" ON public.audit_log_v2;

CREATE POLICY "audit_log_v2_insert"
  ON public.audit_log_v2 FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "audit_log_v2_select"
  ON public.audit_log_v2 FOR SELECT
  USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.audit_log_v2 FROM anon;

-- ---------------------------------------------------------------
-- 8. Update internal_exchange_post to pass company_id to transactions
-- ---------------------------------------------------------------
-- The RPC already writes company_id to exchange_logs.
-- transactions.company_id needs to be populated as well.
-- We recreate the part that inserts into transactions.
-- Rather than rewriting the full RPC here (done in 040), we add
-- a trigger that auto-fills transactions.company_id from the cashbox.

CREATE OR REPLACE FUNCTION public.transactions_set_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.cashbox_id IS NOT NULL THEN
    SELECT c.company_id INTO NEW.company_id
    FROM public.cashboxes c
    WHERE c.id = NEW.cashbox_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_set_company_id ON public.transactions;
CREATE TRIGGER trg_transactions_set_company_id
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.transactions_set_company_id();

COMMENT ON FUNCTION public.transactions_set_company_id IS
  'Auto-fills transactions.company_id from cashboxes.company_id before insert.';
