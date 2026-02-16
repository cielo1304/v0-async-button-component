-- =============================================
-- Script 038: Cashbox Reservations System
-- =============================================
-- Track reserved (held) funds in cashboxes for pending operations
-- Enables available_balance = balance - reserved calculations

-- ─────────────────────────────────────────────
-- 1. Create cashbox_reservations table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashbox_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cashbox_id UUID NOT NULL REFERENCES public.cashboxes(id) ON DELETE CASCADE,
  
  asset_code TEXT NOT NULL, -- Currency/asset being reserved
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  
  side TEXT NOT NULL CHECK (side IN ('in', 'out')),
  -- 'out': we're holding funds to send out (reduce available balance)
  -- 'in': we're expecting funds to receive (informational, might not affect balance)
  
  ref_type TEXT NOT NULL, -- e.g., 'exchange_leg', 'deal', 'payment'
  ref_id UUID NOT NULL,   -- ID of referenced entity
  
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'settled')),
  -- active: reservation is holding funds
  -- released: reservation cancelled/expired
  -- settled: reservation converted to actual transaction
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  notes TEXT
);

-- ─────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────

-- Fast lookup by cashbox and status (for balance calculations)
CREATE INDEX idx_cashbox_reservations_cashbox_status 
  ON public.cashbox_reservations(company_id, cashbox_id, status)
  WHERE status = 'active';

-- Ensure only one active reservation per reference
CREATE UNIQUE INDEX idx_cashbox_reservations_unique_ref 
  ON public.cashbox_reservations(ref_type, ref_id, cashbox_id, asset_code, side, status)
  WHERE status = 'active';

-- Lookup by reference
CREATE INDEX idx_cashbox_reservations_ref 
  ON public.cashbox_reservations(ref_type, ref_id);

-- ─────────────────────────────────────────────
-- 3. Auto-update trigger for updated_at
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cashbox_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cashbox_reservations_updated_at_trigger
  BEFORE UPDATE ON public.cashbox_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.cashbox_reservations_updated_at();

-- ─────────────────────────────────────────────
-- 4. Helper function: cashbox_reserved_sum
-- ─────────────────────────────────────────────
-- Returns total reserved amount for a cashbox (outgoing only)

CREATE OR REPLACE FUNCTION public.cashbox_reserved_sum(p_cashbox_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.cashbox_reservations
  WHERE cashbox_id = p_cashbox_id
    AND status = 'active'
    AND side = 'out';
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.cashbox_reserved_sum(UUID) IS 
  'Returns total reserved (held) amount for a cashbox (only outgoing reservations)';

-- ─────────────────────────────────────────────
-- 5. Helper function: cashbox_available_balance
-- ─────────────────────────────────────────────
-- Returns available balance = current balance - reserved

CREATE OR REPLACE FUNCTION public.cashbox_available_balance(p_cashbox_id UUID)
RETURNS NUMERIC AS $$
  SELECT 
    COALESCE(c.balance, 0) - public.cashbox_reserved_sum(p_cashbox_id)
  FROM public.cashboxes c
  WHERE c.id = p_cashbox_id;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.cashbox_available_balance(UUID) IS 
  'Returns available balance for a cashbox (balance - reserved)';

-- ─────────────────────────────────────────────
-- 6. View: cashbox_balances_with_reserved
-- ─────────────────────────────────────────────
-- Convenient view showing balance, reserved, and available for all cashboxes

CREATE OR REPLACE VIEW public.cashbox_balances_with_reserved AS
SELECT 
  c.id,
  c.company_id,
  c.name,
  c.currency,
  c.balance,
  COALESCE(r.reserved, 0) AS reserved,
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
  'Shows cashbox balances with reserved amounts and available balance';

-- ─────────────────────────────────────────────
-- 7. RLS Policies
-- ─────────────────────────────────────────────

ALTER TABLE public.cashbox_reservations ENABLE ROW LEVEL SECURITY;

-- Select: users can see reservations for their company
CREATE POLICY cashbox_reservations_select ON public.cashbox_reservations
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Insert: authenticated users can create reservations for their company
CREATE POLICY cashbox_reservations_insert ON public.cashbox_reservations
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Update: users can update reservations for their company
CREATE POLICY cashbox_reservations_update ON public.cashbox_reservations
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Delete: users can delete reservations for their company
CREATE POLICY cashbox_reservations_delete ON public.cashbox_reservations
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 8. Comments
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.cashbox_reservations IS 
  'Tracks reserved (held) funds in cashboxes for pending operations';
COMMENT ON COLUMN public.cashbox_reservations.side IS 
  'Direction: out=holding funds to send, in=expecting to receive';
COMMENT ON COLUMN public.cashbox_reservations.status IS 
  'active=holding funds, released=cancelled, settled=converted to transaction';
COMMENT ON COLUMN public.cashbox_reservations.ref_type IS 
  'Type of referencing entity (e.g., exchange_leg, deal)';
COMMENT ON COLUMN public.cashbox_reservations.ref_id IS 
  'ID of referencing entity';
