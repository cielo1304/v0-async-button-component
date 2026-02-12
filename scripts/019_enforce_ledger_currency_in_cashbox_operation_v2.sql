-- ==================== Migration 019: Enforce Ledger Currency in cashbox_operation_v2 ====================
--
-- GOAL: Prevent mismatched ledger currency when creating finance_ledger entries via cashbox ops.
--
-- WHAT: If p_finance_deal_id AND p_ledger_entry_type are provided, enforce that:
--       p_ledger_currency MUST match finance_deals.contract_currency
--
-- WHY: Server-side protection against ledger entries in wrong currency (belt + suspenders with server check)
-- ==========================================================================================================

CREATE OR REPLACE FUNCTION cashbox_operation_v2(
  p_cashbox_id UUID,
  p_amount NUMERIC,
  p_category TEXT,
  p_description TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  -- finance ledger link (optional)
  p_finance_deal_id UUID DEFAULT NULL,
  p_ledger_entry_type TEXT DEFAULT NULL,
  p_ledger_amount NUMERIC DEFAULT NULL,
  p_ledger_currency TEXT DEFAULT 'USD',
  p_ledger_note TEXT DEFAULT NULL
)
RETURNS TABLE(
  new_balance NUMERIC,
  tx_id UUID,
  ledger_id UUID
) AS $$
DECLARE
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_ledger_id UUID := NULL;
  v_cashbox_currency TEXT;
  v_deal_currency TEXT;
BEGIN
  -- 1. Lock cashbox row and check balance
  SELECT balance, currency INTO v_old_balance, v_cashbox_currency
  FROM cashboxes
  WHERE id = p_cashbox_id
  FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id;
  END IF;

  v_new_balance := v_old_balance + p_amount;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient funds in cashbox. Available: %, requested: %', v_old_balance, ABS(p_amount);
  END IF;

  -- 2. CURRENCY VALIDATION: if finance_deal_id provided, ensure currencies match
  IF p_finance_deal_id IS NOT NULL THEN
    SELECT contract_currency INTO v_deal_currency
    FROM finance_deals
    WHERE id = p_finance_deal_id;

    IF v_deal_currency IS NULL THEN
      RAISE EXCEPTION 'Finance deal % not found', p_finance_deal_id;
    END IF;

    IF v_cashbox_currency <> v_deal_currency THEN
      RAISE EXCEPTION 'Currency mismatch: cashbox is %, finance deal requires %. Please exchange first.', 
        v_cashbox_currency, v_deal_currency;
    END IF;

    -- STEP 4: NEW HARDENING - Ledger currency MUST match deal currency
    IF p_ledger_entry_type IS NOT NULL AND p_ledger_currency IS NOT NULL THEN
      IF p_ledger_currency <> v_deal_currency THEN
        RAISE EXCEPTION 'Ledger currency mismatch: provided %, but finance deal requires %. Cannot create ledger entry in wrong currency.', 
          p_ledger_currency, v_deal_currency;
      END IF;
    END IF;
  END IF;

  -- 3. Update cashbox balance
  UPDATE cashboxes
  SET balance = v_new_balance
  WHERE id = p_cashbox_id;

  -- 4. Insert transaction
  INSERT INTO transactions (
    cashbox_id,
    amount,
    category,
    description,
    reference_id,
    deal_id,
    created_by
  )
  VALUES (
    p_cashbox_id,
    p_amount,
    p_category,
    p_description,
    p_reference_id,
    p_deal_id,
    COALESCE(p_created_by, '00000000-0000-0000-0000-000000000000'::UUID)
  )
  RETURNING id INTO v_tx_id;

  -- 5. Optional: create linked finance_ledger entry
  IF p_finance_deal_id IS NOT NULL AND p_ledger_entry_type IS NOT NULL AND p_ledger_amount IS NOT NULL THEN
    INSERT INTO finance_ledger (
      finance_deal_id,
      entry_type,
      amount,
      currency,
      base_amount,
      base_currency,
      note,
      created_by_employee_id
    )
    VALUES (
      p_finance_deal_id,
      p_ledger_entry_type,
      p_ledger_amount,
      p_ledger_currency,
      p_ledger_amount,
      p_ledger_currency,
      p_ledger_note,
      p_created_by
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  -- 6. Return results
  RETURN QUERY SELECT v_new_balance, v_tx_id, v_ledger_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cashbox_operation_v2 IS 'Migration 019: Added ledger currency validation - prevents creating finance_ledger entries in wrong currency';
