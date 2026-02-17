-- =============================================
-- Script 045: Client Exchange Settlements Table
-- =============================================
-- Tracks individual settle-in / settle-out actions against pending client exchanges.
-- Each row records one cash movement that reduces the pending obligation.
-- Used by settleClientExchangeIn / settleClientExchangeOut server actions.

-- ─────────────────────────────────────────────
-- 1. Create settlements table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_exchange_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.client_exchange_operations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  cashbox_id UUID NOT NULL REFERENCES public.cashboxes(id),
  currency TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  comment TEXT,
  actor_employee_id UUID, -- business actor (employees.id)
  created_by UUID,        -- auth.users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_client_exchange_settlements_operation
  ON public.client_exchange_settlements(operation_id);

CREATE INDEX idx_client_exchange_settlements_direction
  ON public.client_exchange_settlements(operation_id, direction);

-- ─────────────────────────────────────────────
-- 2. RLS Policies
-- ─────────────────────────────────────────────

ALTER TABLE public.client_exchange_settlements ENABLE ROW LEVEL SECURITY;

-- Select: auth users can see settlements for operations they can see
CREATE POLICY client_exchange_settlements_select ON public.client_exchange_settlements
  FOR SELECT
  USING (
    operation_id IN (
      SELECT id FROM public.client_exchange_operations
    )
  );

-- Insert: authenticated users
CREATE POLICY client_exchange_settlements_insert ON public.client_exchange_settlements
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────
-- 3. Extend counterparty_ledger ref_type CHECK (if exists)
-- ─────────────────────────────────────────────

-- The counterparty_ledger.ref_type is TEXT, no constraint to extend.
-- The new ref_types used:
--   'client_exchange_settle_in'
--   'client_exchange_settle_out'
-- These are already valid as text values.

-- ─────────────────────────────────────────────
-- 4. Comment
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.client_exchange_settlements IS 'Tracks individual settle actions (in/out) for pending client exchange operations';
COMMENT ON COLUMN public.client_exchange_settlements.direction IS 'in = client pays us, out = we pay client';
COMMENT ON COLUMN public.client_exchange_settlements.actor_employee_id IS 'Business-level actor (employees.id), not necessarily auth user';
COMMENT ON COLUMN public.client_exchange_settlements.created_by IS 'Auth user who performed the action (auth.users.id)';

-- ─────────────────────────────────────────────
-- 5. Verification
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'client_exchange_settlements';

  IF v_count = 1 THEN
    RAISE NOTICE 'SUCCESS: client_exchange_settlements table exists';
  ELSE
    RAISE WARNING 'FAIL: client_exchange_settlements table not found';
  END IF;
END $$;
