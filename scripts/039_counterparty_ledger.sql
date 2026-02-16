-- =============================================
-- Script 039: Counterparty Ledger System
-- =============================================
-- Track mutual debts/obligations with counterparties (clients)
-- Convention: +delta = we owe them, -delta = they owe us

-- ─────────────────────────────────────────────
-- 1. Create counterparty_ledger table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.counterparty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  counterparty_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  asset_code TEXT NOT NULL, -- Currency/asset (e.g., 'USD', 'EUR', 'BTC')
  
  -- Delta convention:
  -- Positive (+): We owe the counterparty (our obligation)
  -- Negative (-): Counterparty owes us (their obligation)
  delta NUMERIC(20, 8) NOT NULL CHECK (delta != 0),
  
  ref_type TEXT NOT NULL, -- e.g., 'exchange_deal', 'payment', 'settlement'
  ref_id UUID NOT NULL,   -- ID of referenced entity
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  notes TEXT
);

-- ─────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────

-- Fast balance calculation by counterparty and asset
CREATE INDEX idx_counterparty_ledger_balance 
  ON public.counterparty_ledger(company_id, counterparty_id, asset_code);

-- Lookup by reference
CREATE INDEX idx_counterparty_ledger_ref 
  ON public.counterparty_ledger(ref_type, ref_id);

-- Time-series queries
CREATE INDEX idx_counterparty_ledger_created_at 
  ON public.counterparty_ledger(company_id, created_at DESC);

-- ─────────────────────────────────────────────
-- 3. Helper function: counterparty_balance
-- ─────────────────────────────────────────────
-- Returns net balance for a counterparty in given asset
-- Positive = we owe them, Negative = they owe us

CREATE OR REPLACE FUNCTION public.counterparty_balance(
  p_company_id UUID,
  p_counterparty_id UUID,
  p_asset_code TEXT
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(delta), 0)
  FROM public.counterparty_ledger
  WHERE company_id = p_company_id
    AND counterparty_id = p_counterparty_id
    AND asset_code = p_asset_code;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.counterparty_balance(UUID, UUID, TEXT) IS 
  'Returns net balance: positive = we owe them, negative = they owe us';

-- ─────────────────────────────────────────────
-- 4. Helper function: counterparty_total_balances
-- ─────────────────────────────────────────────
-- Returns all asset balances for a counterparty

CREATE OR REPLACE FUNCTION public.counterparty_total_balances(
  p_company_id UUID,
  p_counterparty_id UUID
)
RETURNS TABLE (
  asset_code TEXT,
  balance NUMERIC
) AS $$
  SELECT 
    asset_code,
    SUM(delta) AS balance
  FROM public.counterparty_ledger
  WHERE company_id = p_company_id
    AND counterparty_id = p_counterparty_id
  GROUP BY asset_code
  HAVING SUM(delta) != 0
  ORDER BY asset_code;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.counterparty_total_balances(UUID, UUID) IS 
  'Returns all non-zero asset balances for a counterparty';

-- ─────────────────────────────────────────────
-- 5. View: counterparty_balances_summary
-- ─────────────────────────────────────────────
-- Convenient view showing current balances per counterparty

CREATE OR REPLACE VIEW public.counterparty_balances_summary AS
SELECT 
  l.company_id,
  l.counterparty_id,
  c.name AS counterparty_name,
  c.type AS counterparty_type,
  l.asset_code,
  SUM(l.delta) AS balance,
  COUNT(*) AS transaction_count,
  MIN(l.created_at) AS first_transaction,
  MAX(l.created_at) AS last_transaction
FROM public.counterparty_ledger l
JOIN public.contacts c ON c.id = l.counterparty_id
GROUP BY l.company_id, l.counterparty_id, c.name, c.type, l.asset_code
HAVING SUM(l.delta) != 0
ORDER BY l.company_id, l.counterparty_id, l.asset_code;

COMMENT ON VIEW public.counterparty_balances_summary IS 
  'Summary of non-zero balances per counterparty and asset';

-- ─────────────────────────────────────────────
-- 6. Validation trigger: prevent zero deltas
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.counterparty_ledger_validate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER counterparty_ledger_validate_trigger
  BEFORE INSERT OR UPDATE ON public.counterparty_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.counterparty_ledger_validate();

-- ─────────────────────────────────────────────
-- 7. RLS Policies
-- ─────────────────────────────────────────────

ALTER TABLE public.counterparty_ledger ENABLE ROW LEVEL SECURITY;

-- Select: users can see ledger entries for their company
CREATE POLICY counterparty_ledger_select ON public.counterparty_ledger
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Insert: authenticated users can create ledger entries for their company
CREATE POLICY counterparty_ledger_insert ON public.counterparty_ledger
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Update: ledger entries should be immutable (no updates allowed)
-- If correction needed, create compensating entry

-- Delete: only admins can delete (for corrections only)
CREATE POLICY counterparty_ledger_delete ON public.counterparty_ledger
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- ─────────────────────────────────────────────
-- 8. Comments
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.counterparty_ledger IS 
  'Tracks mutual debts/obligations with counterparties (clients)';
COMMENT ON COLUMN public.counterparty_ledger.delta IS 
  'Positive = we owe them, Negative = they owe us (must be non-zero)';
COMMENT ON COLUMN public.counterparty_ledger.ref_type IS 
  'Type of operation creating this entry (exchange_deal, payment, etc.)';
COMMENT ON COLUMN public.counterparty_ledger.ref_id IS 
  'ID of operation creating this entry';

-- ─────────────────────────────────────────────
-- 9. Example usage queries
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.counterparty_balance IS $$
Example usage:
  -- Check if client owes us money
  SELECT counterparty_balance(company_id, client_id, 'USD');
  -- Positive: we owe them $X
  -- Negative: they owe us $X
  -- Zero: no outstanding balance
$$;
