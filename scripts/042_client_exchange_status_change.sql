-- =============================================
-- Script 042: Client Exchange Status Change RPC
-- =============================================
-- Change exchange deal status with automatic reservation management

-- ─────────────────────────────────────────────
-- RPC: public.exchange_set_status
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exchange_set_status(
  p_deal_id UUID,
  p_status_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal RECORD;
  v_status RECORD;
  v_company_id UUID;
  v_leg RECORD;
  v_reserve_in BOOLEAN;
  v_reserve_out BOOLEAN;
  v_terminal_success BOOLEAN;
  v_terminal_fail BOOLEAN;
  v_total_amount NUMERIC;
  v_total_settled NUMERIC;
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
  WHERE id = p_deal_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exchange deal not found: %', p_deal_id;
  END IF;
  
  IF v_deal.company_id != v_company_id THEN
    RAISE EXCEPTION 'Deal does not belong to user company';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 3. Fetch status definition and extract flags
  -- ═══════════════════════════════════════════
  
  SELECT * INTO v_status
  FROM exchange_statuses
  WHERE company_id = v_company_id
    AND code = p_status_code
    AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Status not found or inactive: %', p_status_code;
  END IF;
  
  -- Extract flags from JSONB
  v_reserve_in := COALESCE((v_status.flags_json->>'reserve_in')::BOOLEAN, false);
  v_reserve_out := COALESCE((v_status.flags_json->>'reserve_out')::BOOLEAN, false);
  v_terminal_success := COALESCE((v_status.flags_json->>'terminal_success')::BOOLEAN, false);
  v_terminal_fail := COALESCE((v_status.flags_json->>'terminal_fail')::BOOLEAN, false);
  
  -- ═══════════════════════════════════════════
  -- 4. If terminal_success, verify all legs are fully settled
  -- ═══════════════════════════════════════════
  
  IF v_terminal_success THEN
    -- Check if amount_settled column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'exchange_legs'
      AND column_name = 'amount_settled'
    ) THEN
      SELECT 
        SUM(amount) AS total_amount,
        SUM(COALESCE(amount_settled, 0)) AS total_settled
      INTO v_total_amount, v_total_settled
      FROM exchange_legs
      WHERE deal_id = p_deal_id;
      
      IF v_total_settled < v_total_amount THEN
        RAISE EXCEPTION 'Cannot mark as completed: legs not fully settled (settled: %, total: %)', 
          v_total_settled, v_total_amount;
      END IF;
    END IF;
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 5. If terminal_fail, release all active reservations
  -- ═══════════════════════════════════════════
  
  IF v_terminal_fail THEN
    UPDATE cashbox_reservations
    SET status = 'released',
        updated_at = NOW()
    WHERE ref_type = 'exchange_leg'
      AND ref_id IN (
        SELECT id FROM exchange_legs WHERE deal_id = p_deal_id
      )
      AND status = 'active';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 6. Manage reservations based on flags
  -- ═══════════════════════════════════════════
  
  -- Iterate through all legs
  FOR v_leg IN 
    SELECT * FROM exchange_legs 
    WHERE deal_id = p_deal_id AND cashbox_id IS NOT NULL
  LOOP
    -- Determine if we should reserve this leg
    IF (v_leg.direction = 'in' AND v_reserve_in) OR 
       (v_leg.direction = 'out' AND v_reserve_out) THEN
      
      -- Create or ensure reservation exists
      INSERT INTO cashbox_reservations (
        company_id,
        cashbox_id,
        asset_code,
        amount,
        side,
        ref_type,
        ref_id,
        status,
        created_by,
        notes
      ) VALUES (
        v_company_id,
        v_leg.cashbox_id,
        v_leg.asset_code,
        v_leg.amount,
        v_leg.direction, -- 'in' or 'out'
        'exchange_leg',
        v_leg.id,
        'active',
        auth.uid(),
        'Reservation for exchange deal ' || p_deal_id::TEXT
      )
      ON CONFLICT ON CONSTRAINT idx_cashbox_reservations_unique_ref
      DO UPDATE SET
        amount = EXCLUDED.amount,
        updated_at = NOW();
      
    ELSE
      -- Release reservation if it exists and shouldn't be active
      UPDATE cashbox_reservations
      SET status = 'released',
          updated_at = NOW()
      WHERE ref_type = 'exchange_leg'
        AND ref_id = v_leg.id
        AND cashbox_id = v_leg.cashbox_id
        AND status = 'active';
    END IF;
  END LOOP;
  
  -- ═══════════════════════════════════════════
  -- 7. Update deal status
  -- ═══════════════════════════════════════════
  
  UPDATE exchange_deals
  SET status = p_status_code,
      updated_at = NOW()
  WHERE id = p_deal_id;
  
  -- ═══════════════════════════════════════════
  -- 8. Audit log
  -- ═══════════════════════════════════════════
  
  INSERT INTO audit_events (
    company_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    v_company_id,
    auth.uid(),
    'exchange_status_change',
    'exchange_deal',
    p_deal_id,
    jsonb_build_object(
      'old_status', v_deal.status,
      'new_status', p_status_code,
      'reserve_in', v_reserve_in,
      'reserve_out', v_reserve_out,
      'terminal_success', v_terminal_success,
      'terminal_fail', v_terminal_fail
    )
  );
  
END;
$$;

-- ─────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.exchange_set_status TO authenticated;

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.exchange_set_status IS 
  'Change exchange deal status with automatic reservation management based on status flags';
