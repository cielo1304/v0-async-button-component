-- ============================================================================
-- Migration 017: Fix cashbox_operation_v2 to match transactions schema
-- ============================================================================
-- This migration ensures cashbox_operation_v2 is compatible with the actual
-- transactions table schema (balance_after NOT NULL, reference_id UUID).
-- It also adds currency validation for finance deals and proper audit support.

-- Drop all existing versions of cashbox_operation_v2 to avoid ambiguity
DROP FUNCTION IF EXISTS cashbox_operation_v2(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS cashbox_operation_v2(UUID, NUMERIC, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS cashbox_operation_v2 CASCADE;

-- Create the new correct version
CREATE FUNCTION cashbox_operation_v2(
  p_cashbox_id       UUID,
  p_amount           NUMERIC,
  p_category         TEXT,
  p_description      TEXT     DEFAULT NULL,
  p_reference_id     UUID     DEFAULT NULL,
  p_deal_id          UUID     DEFAULT NULL,
  p_created_by       UUID     DEFAULT '00000000-0000-0000-0000-000000000000',
  -- Finance deal integration
  p_finance_deal_id  UUID     DEFAULT NULL,
  p_ledger_entry_type TEXT    DEFAULT NULL,
  p_ledger_amount    NUMERIC  DEFAULT NULL,
  p_ledger_currency  TEXT     DEFAULT 'USD',
  p_ledger_note      TEXT     DEFAULT NULL
)
RETURNS TABLE(new_balance NUMERIC, tx_id UUID, ledger_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_ledger_id UUID := NULL;
  v_is_archived BOOLEAN;
  v_cashbox_currency TEXT;
  v_deal_currency TEXT;
BEGIN
  -- 1. Lock cashbox row and get current state
  SELECT balance, is_archived, currency 
  INTO v_old_balance, v_is_archived, v_cashbox_currency
  FROM cashboxes
  WHERE id = p_cashbox_id
  FOR UPDATE;

  -- 2. Validate cashbox exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id;
  END IF;

  -- 3. Check if cashbox is archived
  IF v_is_archived THEN
    RAISE EXCEPTION 'Cashbox % is archived and cannot be used', p_cashbox_id;
  END IF;

  -- 4. Calculate new balance
  v_new_balance := v_old_balance + p_amount;

  -- 5. Validate balance won't go negative
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient funds in cashbox. Available: %, requested: %, result: %', 
      v_old_balance, ABS(p_amount), v_new_balance;
  END IF;

  -- 6. CURRENCY VALIDATION: if finance_deal_id provided, ensure currencies match
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
  END IF;

  -- 7. Update cashbox balance and updated_at timestamp
  UPDATE cashboxes
  SET balance = v_new_balance,
      updated_at = now()
  WHERE id = p_cashbox_id;

  -- 8. Insert transaction with balance_after (required by schema)
  INSERT INTO transactions(
    cashbox_id, 
    amount, 
    balance_after,  -- REQUIRED: new balance after this transaction
    category,       -- UPPERCASE for consistency
    description,
    reference_id,   -- UUID type (can be NULL)
    deal_id,
    created_by
  )
  VALUES (
    p_cashbox_id,
    p_amount,
    v_new_balance,  -- Write the new balance
    UPPER(p_category),
    COALESCE(p_description, p_category),
    p_reference_id,
    p_deal_id,
    p_created_by
  )
  RETURNING id INTO v_tx_id;

  -- 9. Optionally create linked finance_ledger entry
  IF p_finance_deal_id IS NOT NULL AND p_ledger_entry_type IS NOT NULL THEN
    INSERT INTO finance_ledger(
      finance_deal_id,
      entry_type,
      amount,
      currency,
      base_amount,
      base_currency,
      note,
      transaction_id,        -- Link back to the transaction
      cashbox_id,            -- Link to the cashbox
      created_by_employee_id -- Actor who performed this action
    )
    VALUES (
      p_finance_deal_id,
      p_ledger_entry_type,
      COALESCE(p_ledger_amount, ABS(p_amount)),
      p_ledger_currency,
      COALESCE(p_ledger_amount, ABS(p_amount)),  -- base_amount = amount for now (no FX conversion yet)
      p_ledger_currency,                          -- base_currency = currency for now
      p_ledger_note,
      v_tx_id,
      p_cashbox_id,
      p_created_by
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  -- 10. Return results
  RETURN QUERY SELECT v_new_balance, v_tx_id, v_ledger_id;
END;
$$;

-- Add comprehensive comment explaining the function
COMMENT ON FUNCTION cashbox_operation_v2 IS 
'Atomic cashbox operation with balance tracking and finance deal integration.
- Validates cashbox exists and is not archived
- Validates sufficient funds for withdrawals
- Validates currency match between cashbox and finance deal (if deal specified)
- Updates cashbox balance atomically with FOR UPDATE lock
- Writes transaction with balance_after field (required by schema)
- Optionally creates finance_ledger entry linked to transaction
- Returns new balance, transaction ID, and ledger ID (if created)
- All categories are stored in UPPERCASE for consistency';
