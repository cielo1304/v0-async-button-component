-- =============================================
-- Script 041: Client Exchange Settlement RPC
-- =============================================
-- Apply settlement (actual payment) to exchange leg and counterparty ledger

-- ─────────────────────────────────────────────
-- RPC: public.exchange_apply_settlement
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exchange_apply_settlement(
  p_deal_id UUID,
  p_leg_id UUID,
  p_transaction_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leg RECORD;
  v_deal RECORD;
  v_transaction RECORD;
  v_company_id UUID;
  v_settled_amount NUMERIC;
  v_ledger_delta NUMERIC;
  v_counterparty_id UUID;
BEGIN
  -- ═══════════════════════════════════════════
  -- 1. Auth check: verify user belongs to company
  -- ═══════════════════════════════════════════
  
  SELECT company_id INTO v_company_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in any company';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 2. Fetch deal and verify company membership
  -- ═══════════════════════════════════════════
  
  SELECT * INTO v_deal
  FROM exchange_deals
  WHERE id = p_deal_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exchange deal not found: %', p_deal_id;
  END IF;
  
  IF v_deal.company_id != v_company_id THEN
    RAISE EXCEPTION 'Deal does not belong to user company';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 3. Fetch leg
  -- ═══════════════════════════════════════════
  
  SELECT * INTO v_leg
  FROM exchange_legs
  WHERE id = p_leg_id AND deal_id = p_deal_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exchange leg not found or does not belong to deal';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 4. Fetch transaction and verify it belongs to leg's cashbox
  -- ═══════════════════════════════════════════
  
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  IF v_transaction.cashbox_id != v_leg.cashbox_id THEN
    RAISE EXCEPTION 'Transaction does not belong to leg cashbox';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 5. Calculate settled amount (absolute value of transaction)
  -- ═══════════════════════════════════════════
  
  v_settled_amount := ABS(v_transaction.amount);
  
  -- ═══════════════════════════════════════════
  -- 6. Update amount_settled on leg
  -- ═══════════════════════════════════════════
  
  -- Add amount_settled column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_legs'
    AND column_name = 'amount_settled'
  ) THEN
    -- Will be added later, for now just skip
    NULL;
  ELSE
    UPDATE exchange_legs
    SET amount_settled = COALESCE(amount_settled, 0) + v_settled_amount,
        updated_at = NOW()
    WHERE id = p_leg_id;
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 7. Determine counterparty from deal metadata
  -- ═══════════════════════════════════════════
  
  -- Check if deal has counterparty_id field
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_deals'
    AND column_name = 'counterparty_id'
  ) THEN
    v_counterparty_id := (v_deal).counterparty_id;
  ELSE
    -- No counterparty tracking yet, skip ledger entry
    RETURN;
  END IF;
  
  IF v_counterparty_id IS NULL THEN
    -- No counterparty assigned, skip ledger
    RETURN;
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 8. Create counterparty ledger entry
  -- ═══════════════════════════════════════════
  -- Convention: +delta = we owe them, -delta = they owe us
  
  IF v_leg.direction = 'in' THEN
    -- Client paid us (incoming), so they reduced their debt or we owe them less
    -- Negative delta: they paid us
    v_ledger_delta := -v_settled_amount;
  ELSE
    -- We paid out to client (outgoing), so we reduced our debt or they owe us less
    -- Positive delta: we paid them
    v_ledger_delta := v_settled_amount;
  END IF;
  
  INSERT INTO counterparty_ledger (
    company_id,
    counterparty_id,
    asset_code,
    delta,
    ref_type,
    ref_id,
    created_by,
    notes
  ) VALUES (
    v_company_id,
    v_counterparty_id,
    v_leg.asset_code,
    v_ledger_delta,
    'exchange_settlement',
    p_transaction_id,
    auth.uid(),
    'Settlement for exchange leg ' || p_leg_id::TEXT
  );
  
  -- ═══════════════════════════════════════════
  -- 9. Optionally release/update reservations
  -- ═══════════════════════════════════════════
  
  -- Mark reservation as settled if it exists
  UPDATE cashbox_reservations
  SET status = 'settled',
      updated_at = NOW()
  WHERE ref_type = 'exchange_leg'
    AND ref_id = p_leg_id
    AND cashbox_id = v_leg.cashbox_id
    AND status = 'active';
  
END;
$$;

-- ─────────────────────────────────────────────
-- Add amount_settled and counterparty_id columns if needed
-- ─────────────────────────────────────────────

DO $$
BEGIN
  -- Add amount_settled to exchange_legs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_legs'
    AND column_name = 'amount_settled'
  ) THEN
    ALTER TABLE public.exchange_legs 
    ADD COLUMN amount_settled NUMERIC(20, 8) DEFAULT 0;
    
    CREATE INDEX idx_exchange_legs_amount_settled 
      ON public.exchange_legs(deal_id, amount_settled);
  END IF;
  
  -- Add counterparty_id to exchange_deals
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'exchange_deals'
    AND column_name = 'counterparty_id'
  ) THEN
    ALTER TABLE public.exchange_deals 
    ADD COLUMN counterparty_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
    
    CREATE INDEX idx_exchange_deals_counterparty 
      ON public.exchange_deals(company_id, counterparty_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.exchange_apply_settlement TO authenticated;

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.exchange_apply_settlement IS 
  'Apply settlement (actual payment) to exchange leg and record in counterparty ledger';
