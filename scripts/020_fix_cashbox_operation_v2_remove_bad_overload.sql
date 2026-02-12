-- ==================== Migration 020: Fix cashbox_operation_v2 - Remove Bad Overload ====================
--
-- PROBLEM: Migration 019 created an incorrect overload with:
--   - p_reference_id TEXT (should be UUID)
--   - Missing balance_after in transactions INSERT (required NOT NULL field)
--   - Missing is_archived check
--   - Missing updated_at timestamp update
--   - Missing transaction_id link in finance_ledger
--
-- SOLUTION: 
--   1. Drop the bad overload (TEXT reference_id)
--   2. Create ONE final cashbox_operation_v2 with correct signature from 017
--   3. Add ledger currency validation from 019 (the good part)
--
-- RESULT: Single, working function with proper UUID types and balance_after tracking
-- ==========================================================================================================

-- STEP A: Drop the bad overload with TEXT reference_id
DROP FUNCTION IF EXISTS cashbox_operation_v2(
  UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT
) CASCADE;

-- STEP B: Create the ONE correct version with UUID reference_id + ledger currency validation
CREATE OR REPLACE FUNCTION cashbox_operation_v2(
  p_cashbox_id       UUID,
  p_amount           NUMERIC,
  p_category         TEXT,
  p_description      TEXT     DEFAULT NULL,
  p_reference_id     UUID     DEFAULT NULL,     -- UUID type (correct)
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

  -- 3. Check if cashbox is archived (from 017)
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

    -- 6a. Check cashbox currency matches deal currency (from 017)
    IF v_cashbox_currency <> v_deal_currency THEN
      RAISE EXCEPTION 'Currency mismatch: cashbox is %, finance deal requires %. Please exchange first.', 
        v_cashbox_currency, v_deal_currency;
    END IF;

    -- 6b. HARDENING FROM 019: Check ledger currency matches deal currency
    IF p_ledger_entry_type IS NOT NULL AND p_ledger_currency IS NOT NULL THEN
      IF p_ledger_currency <> v_deal_currency THEN
        RAISE EXCEPTION 'Ledger currency mismatch: provided %, but finance deal requires %. Cannot create ledger entry in wrong currency.', 
          p_ledger_currency, v_deal_currency;
      END IF;
    END IF;
  END IF;

  -- 7. Update cashbox balance and updated_at timestamp (from 017)
  UPDATE cashboxes
  SET balance = v_new_balance,
      updated_at = now()
  WHERE id = p_cashbox_id;

  -- 8. Insert transaction with balance_after (REQUIRED by schema)
  INSERT INTO transactions(
    cashbox_id, 
    amount, 
    balance_after,  -- CRITICAL: required NOT NULL field
    category,       -- UPPERCASE for consistency
    description,
    reference_id,   -- UUID type (correct)
    deal_id,
    created_by
  )
  VALUES (
    p_cashbox_id,
    p_amount,
    v_new_balance,  -- Write the new balance after this transaction
    UPPER(p_category),
    COALESCE(p_description, p_category),
    p_reference_id, -- UUID can be NULL
    p_deal_id,
    p_created_by
  )
  RETURNING id INTO v_tx_id;

  -- 9. Optionally create linked finance_ledger entry (from 017 + 019 validation)
  IF p_finance_deal_id IS NOT NULL AND p_ledger_entry_type IS NOT NULL THEN
    INSERT INTO finance_ledger(
      finance_deal_id,
      entry_type,
      amount,
      currency,
      base_amount,
      base_currency,
      note,
      transaction_id,        -- Link back to the transaction (from 017)
      cashbox_id,            -- Link to the cashbox (from 017)
      created_by_employee_id -- Actor who performed this action (from 017)
    )
    VALUES (
      p_finance_deal_id,
      p_ledger_entry_type,
      COALESCE(p_ledger_amount, ABS(p_amount)),
      p_ledger_currency,
      COALESCE(p_ledger_amount, ABS(p_amount)),  -- base_amount = amount for now (no FX conversion yet)
      p_ledger_currency,                          -- base_currency = currency for now
      p_ledger_note,
      v_tx_id,              -- CRITICAL: link to transaction (was missing in 019)
      p_cashbox_id,         -- CRITICAL: link to cashbox (was missing in 019)
      p_created_by          -- CRITICAL: audit trail (was missing in 019)
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  -- 10. Return results
  RETURN QUERY SELECT v_new_balance, v_tx_id, v_ledger_id;
END;
$$;

-- Add comprehensive comment
COMMENT ON FUNCTION cashbox_operation_v2 IS 
'Migration 020: Final corrected version combining 017 + 019.
- UUID reference_id (correct type for transactions table)
- balance_after tracking (required NOT NULL field in transactions)
- is_archived validation (prevents operations on archived cashboxes)
- updated_at timestamp (proper audit trail)
- Currency match validation (cashbox vs deal)
- Ledger currency validation (from 019 - prevents wrong currency ledger entries)
- Proper finance_ledger linking (transaction_id, cashbox_id, created_by_employee_id)
- Returns new_balance, tx_id, ledger_id
- All categories stored in UPPERCASE for consistency';

-- ==================== VERIFICATION ====================
-- After this migration:
-- ✅ Only ONE cashbox_operation_v2 function exists
-- ✅ Uses UUID for reference_id (matches transactions table)
-- ✅ Writes balance_after to transactions (required field)
-- ✅ Checks is_archived before operations
-- ✅ Updates updated_at timestamp on cashboxes
-- ✅ Validates cashbox currency vs deal currency
-- ✅ Validates ledger currency vs deal currency (hardening from 019)
-- ✅ Properly links finance_ledger entries to transactions
-- ✅ No ambiguous function call errors
-- =======================================================
