-- =============================================
-- Script 037: Exchange Statuses System
-- =============================================
-- Configurable status system for client exchange deals
-- with flags for reservation and settlement logic

-- ─────────────────────────────────────────────
-- 1. Create exchange_statuses table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exchange_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[a-z_]+$'),
  name TEXT NOT NULL,
  
  -- Flags control behavior
  flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected flags:
  -- {
  --   "reserve_in": true/false,     -- Reserve incoming assets
  --   "reserve_out": true/false,    -- Reserve outgoing assets
  --   "allow_settle_in": true/false, -- Allow settlement of incoming leg
  --   "allow_settle_out": true/false, -- Allow settlement of outgoing leg
  --   "terminal_success": true/false, -- Final successful state
  --   "terminal_fail": true/false     -- Final failed state
  -- }
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(company_id, code)
);

-- Index for active lookups
CREATE INDEX idx_exchange_statuses_company_active 
  ON public.exchange_statuses(company_id, is_active) 
  WHERE is_active = true;

-- ─────────────────────────────────────────────
-- 2. Auto-update trigger for updated_at
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exchange_statuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exchange_statuses_updated_at_trigger
  BEFORE UPDATE ON public.exchange_statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.exchange_statuses_updated_at();

-- ─────────────────────────────────────────────
-- 3. Seed default statuses for all companies
-- ─────────────────────────────────────────────

-- Helper function to seed statuses for a company
CREATE OR REPLACE FUNCTION public.seed_exchange_statuses_for_company(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  -- draft: no reservations, no settlements, not terminal
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'draft',
    'Черновик',
    jsonb_build_object(
      'reserve_in', false,
      'reserve_out', false,
      'allow_settle_in', false,
      'allow_settle_out', false,
      'terminal_success', false,
      'terminal_fail', false
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;

  -- waiting_client: reserve OUT (we're holding funds), no settlements yet
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'waiting_client',
    'Ожидание клиента',
    jsonb_build_object(
      'reserve_in', false,
      'reserve_out', true,
      'allow_settle_in', false,
      'allow_settle_out', false,
      'terminal_success', false,
      'terminal_fail', false
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;

  -- waiting_payout: reserve IN (client has paid), allow settlements
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'waiting_payout',
    'Ожидание выплаты',
    jsonb_build_object(
      'reserve_in', true,
      'reserve_out', true,
      'allow_settle_in', true,
      'allow_settle_out', true,
      'terminal_success', false,
      'terminal_fail', false
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;

  -- completed: terminal success, all settled
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'completed',
    'Завершено',
    jsonb_build_object(
      'reserve_in', false,
      'reserve_out', false,
      'allow_settle_in', false,
      'allow_settle_out', false,
      'terminal_success', true,
      'terminal_fail', false
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;

  -- failed: terminal failure, release reservations
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'failed',
    'Не удалось',
    jsonb_build_object(
      'reserve_in', false,
      'reserve_out', false,
      'allow_settle_in', false,
      'allow_settle_out', false,
      'terminal_success', false,
      'terminal_fail', true
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;

  -- cancelled: terminal failure, release reservations
  INSERT INTO public.exchange_statuses (company_id, code, name, flags_json)
  VALUES (
    p_company_id,
    'cancelled',
    'Отменено',
    jsonb_build_object(
      'reserve_in', false,
      'reserve_out', false,
      'allow_settle_in', false,
      'allow_settle_out', false,
      'terminal_success', false,
      'terminal_fail', true
    )
  ) ON CONFLICT (company_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed for all existing companies
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM public.companies
  LOOP
    PERFORM public.seed_exchange_statuses_for_company(comp.id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- 4. RLS Policies
-- ─────────────────────────────────────────────

ALTER TABLE public.exchange_statuses ENABLE ROW LEVEL SECURITY;

-- Select: users can see statuses for their company
CREATE POLICY exchange_statuses_select ON public.exchange_statuses
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Insert: only admins can create new statuses
CREATE POLICY exchange_statuses_insert ON public.exchange_statuses
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Update: only admins can update statuses
CREATE POLICY exchange_statuses_update ON public.exchange_statuses
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Delete: only admins can delete statuses
CREATE POLICY exchange_statuses_delete ON public.exchange_statuses
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- ─────────────────────────────────────────────
-- 5. Comments
-- ─────────────────────────────────────────────

COMMENT ON TABLE public.exchange_statuses IS 'Configurable status system for client exchange deals';
COMMENT ON COLUMN public.exchange_statuses.code IS 'Unique status code per company (e.g., draft, waiting_client)';
COMMENT ON COLUMN public.exchange_statuses.flags_json IS 'Behavior flags: reserve_in, reserve_out, allow_settle_*, terminal_*';
