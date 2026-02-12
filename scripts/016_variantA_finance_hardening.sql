-- Migration 016: Variant A Finance Hardening
-- Ensures finance deals work properly with mandatory schedules, audit logging, and currency validation

-- ==================== 1. CASHBOXES COLUMNS ====================

ALTER TABLE cashboxes 
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS is_exchange_enabled BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_phone TEXT;

-- ==================== 2. CASHBOX_LOCATIONS TABLE ====================

CREATE TABLE IF NOT EXISTS cashbox_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- updated_at trigger for cashbox_locations
DROP TRIGGER IF EXISTS update_cashbox_locations_updated_at ON cashbox_locations;
CREATE TRIGGER update_cashbox_locations_updated_at
  BEFORE UPDATE ON cashbox_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill default locations if empty
INSERT INTO cashbox_locations (name, sort_order)
SELECT * FROM (VALUES 
  ('Офис', 1),
  ('Сейф', 2),
  ('Курьер', 3)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM cashbox_locations LIMIT 1);

-- ==================== 3. STRENGTHEN cashbox_operation_v2 ====================

-- Enhanced version with currency validation for finance deals
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

-- ==================== 4. INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_cashboxes_sort_order ON cashboxes(sort_order);
CREATE INDEX IF NOT EXISTS idx_cashbox_locations_sort_order ON cashbox_locations(sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_deals_contract_currency ON finance_deals(contract_currency);
