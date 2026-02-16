-- =============================================
-- Script 043: Exchange Legs Amount Settled
-- =============================================
-- Add amount_settled and updated_at columns to exchange_legs table

-- ─────────────────────────────────────────────
-- Add amount_settled column
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_legs'
    AND column_name = 'amount_settled'
  ) THEN
    ALTER TABLE public.exchange_legs 
    ADD COLUMN amount_settled NUMERIC(20, 8) NOT NULL DEFAULT 0;
    
    COMMENT ON COLUMN public.exchange_legs.amount_settled IS 
      'Amount that has been settled (paid/received) for this leg';
    
    CREATE INDEX idx_exchange_legs_amount_settled 
      ON public.exchange_legs(deal_id, amount_settled)
      WHERE amount_settled > 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Add updated_at column with trigger
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_legs'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.exchange_legs 
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    
    COMMENT ON COLUMN public.exchange_legs.updated_at IS 
      'Timestamp of last update to this leg';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Create or replace update trigger
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exchange_legs_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_legs_updated_at_trigger ON public.exchange_legs;

CREATE TRIGGER exchange_legs_updated_at_trigger
  BEFORE UPDATE ON public.exchange_legs
  FOR EACH ROW
  EXECUTE FUNCTION public.exchange_legs_set_updated_at();

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────

COMMENT ON TRIGGER exchange_legs_updated_at_trigger ON public.exchange_legs IS 
  'Automatically update updated_at timestamp on row modification';
