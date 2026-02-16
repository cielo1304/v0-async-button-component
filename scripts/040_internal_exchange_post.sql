-- =============================================
-- Script 040: Internal Exchange Post RPC
-- =============================================
-- Atomic internal exchange between company's own cashboxes
-- Used by /finance for internal currency operations

-- ─────────────────────────────────────────────
-- RPC: public.internal_exchange_post
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.internal_exchange_post(
  request_id UUID,
  p_company_id UUID,
  from_cashbox_id UUID,
  to_cashbox_id UUID,
  from_amount NUMERIC,
  rate NUMERIC,
  fee NUMERIC DEFAULT 0,
  comment TEXT DEFAULT NULL,
  acted_by UUID DEFAULT NULL
)
RETURNS UUID -- Returns exchange_log_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_box RECORD;
  v_to_box RECORD;
  v_received_amount NUMERIC;
  v_new_from_balance NUMERIC;
  v_new_to_balance NUMERIC;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_exchange_log_id UUID;
  v_available_balance NUMERIC;
BEGIN
  -- ═══════════════════════════════════════════
  -- 0. SECURITY: Auth and company membership check
  -- ═══════════════════════════════════════════
  
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM team_members 
    WHERE user_id = auth.uid() 
    AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to company';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 1. Idempotency check
  -- ═══════════════════════════════════════════
  
  SELECT id INTO v_exchange_log_id
  FROM exchange_logs
  WHERE request_id = internal_exchange_post.request_id
  LIMIT 1;
  
  IF FOUND THEN
    -- Already processed, return existing ID
    RETURN v_exchange_log_id;
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 2. Input validation
  -- ═══════════════════════════════════════════
  
  IF from_amount <= 0 THEN
    RAISE EXCEPTION 'from_amount must be positive';
  END IF;
  
  IF rate <= 0 THEN
    RAISE EXCEPTION 'rate must be positive';
  END IF;
  
  IF fee < 0 THEN
    RAISE EXCEPTION 'fee cannot be negative';
  END IF;
  
  IF from_cashbox_id = to_cashbox_id THEN
    RAISE EXCEPTION 'Cannot exchange between same cashbox';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 3. Lock and fetch cashboxes (FOR UPDATE for atomicity)
  -- ═══════════════════════════════════════════
  
  SELECT * INTO v_from_box
  FROM cashboxes
  WHERE id = from_cashbox_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'From cashbox not found: %', from_cashbox_id;
  END IF;
  
  SELECT * INTO v_to_box
  FROM cashboxes
  WHERE id = to_cashbox_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'To cashbox not found: %', to_cashbox_id;
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 4. Security: verify company ownership
  -- ═══════════════════════════════════════════
  
  IF v_from_box.company_id != p_company_id THEN
    RAISE EXCEPTION 'From cashbox does not belong to company';
  END IF;
  
  IF v_to_box.company_id != p_company_id THEN
    RAISE EXCEPTION 'To cashbox does not belong to company';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 5. Verify cashboxes are not archived
  -- ═══════════════════════════════════════════
  
  IF v_from_box.is_archived THEN
    RAISE EXCEPTION 'From cashbox is archived';
  END IF;
  
  IF v_to_box.is_archived THEN
    RAISE EXCEPTION 'To cashbox is archived';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 6. Verify different currencies
  -- ═══════════════════════════════════════════
  
  IF v_from_box.currency = v_to_box.currency THEN
    RAISE EXCEPTION 'Cannot exchange same currency';
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 7. Check available balance (balance - reserved)
  -- ═══════════════════════════════════════════
  
  v_available_balance := v_from_box.balance - cashbox_reserved_sum(from_cashbox_id);
  
  IF v_available_balance < from_amount THEN
    RAISE EXCEPTION 'Insufficient available balance: % (balance: %, reserved: %)', 
      v_available_balance, v_from_box.balance, cashbox_reserved_sum(from_cashbox_id);
  END IF;
  
  -- ═══════════════════════════════════════════
  -- 8. Calculate received amount and new balances
  -- ═══════════════════════════════════════════
  
  v_received_amount := from_amount * rate;
  v_new_from_balance := v_from_box.balance - from_amount;
  v_new_to_balance := v_to_box.balance + v_received_amount;
  
  -- ═══════════════════════════════════════════
  -- 9. Update balances
  -- ═══════════════════════════════════════════
  
  UPDATE cashboxes
  SET balance = v_new_from_balance,
      updated_at = NOW()
  WHERE id = from_cashbox_id;
  
  UPDATE cashboxes
  SET balance = v_new_to_balance,
      updated_at = NOW()
  WHERE id = to_cashbox_id;
  
  -- ═══════════════════════════════════════════
  -- 10. Create OUT transaction
  -- ═══════════════════════════════════════════
  
  INSERT INTO transactions (
    cashbox_id,
    amount,
    balance_after,
    category,
    description,
    created_by
  ) VALUES (
    from_cashbox_id,
    -from_amount,
    v_new_from_balance,
    'EXCHANGE_OUT',
    COALESCE(comment, 'Internal exchange to ' || v_to_box.currency),
    COALESCE(acted_by, auth.uid())
  )
  RETURNING id INTO v_tx_out_id;
  
  -- ═══════════════════════════════════════════
  -- 11. Create IN transaction
  -- ═══════════════════════════════════════════
  
  INSERT INTO transactions (
    cashbox_id,
    amount,
    balance_after,
    category,
    description,
    reference_id,
    created_by
  ) VALUES (
    to_cashbox_id,
    v_received_amount,
    v_new_to_balance,
    'EXCHANGE_IN',
    COALESCE(comment, 'Internal exchange from ' || v_from_box.currency),
    v_tx_out_id,
    COALESCE(acted_by, auth.uid())
  )
  RETURNING id INTO v_tx_in_id;
  
  -- ═══════════════════════════════════════════
  -- 12. Create exchange log
  -- ═══════════════════════════════════════════
  
  INSERT INTO exchange_logs (
    request_id,
    company_id,
    from_box_id,
    to_box_id,
    sent_amount,
    sent_currency,
    received_amount,
    received_currency,
    rate,
    fee_amount,
    fee_currency,
    created_by
  ) VALUES (
    request_id,
    p_company_id,
    from_cashbox_id,
    to_cashbox_id,
    from_amount,
    v_from_box.currency,
    v_received_amount,
    v_to_box.currency,
    rate,
    NULLIF(fee, 0),
    CASE WHEN fee > 0 THEN v_from_box.currency ELSE NULL END,
    COALESCE(acted_by, auth.uid())
  )
  RETURNING id INTO v_exchange_log_id;
  
  -- ═══════════════════════════════════════════
  -- 13. Audit event
  -- ═══════════════════════════════════════════
  
  INSERT INTO audit_events (
    company_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    p_company_id,
    COALESCE(acted_by, auth.uid()),
    'internal_exchange',
    'exchange_log',
    v_exchange_log_id,
    jsonb_build_object(
      'from_cashbox_id', from_cashbox_id,
      'to_cashbox_id', to_cashbox_id,
      'from_amount', from_amount,
      'from_currency', v_from_box.currency,
      'received_amount', v_received_amount,
      'to_currency', v_to_box.currency,
      'rate', rate,
      'fee', fee,
      'request_id', request_id
    )
  );
  
  -- ═══════════════════════════════════════════
  -- 14. Return exchange log ID
  -- ═══════════════════════════════════════════
  
  RETURN v_exchange_log_id;
  
END;
$$;

-- ─────────────────────────────────────────────
-- Add request_id to exchange_logs if not exists
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exchange_logs' 
    AND column_name = 'request_id'
  ) THEN
    ALTER TABLE public.exchange_logs 
    ADD COLUMN request_id UUID UNIQUE;
    
    CREATE INDEX idx_exchange_logs_request_id 
      ON public.exchange_logs(request_id) 
      WHERE request_id IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'exchange_logs' 
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.exchange_logs 
    ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    
    CREATE INDEX idx_exchange_logs_company_id 
      ON public.exchange_logs(company_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.internal_exchange_post TO authenticated;

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.internal_exchange_post IS 
  'Atomic internal exchange between company cashboxes with idempotency, locking, and audit';
