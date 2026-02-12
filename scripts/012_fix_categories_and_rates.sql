-- ============================================================================
-- Migration 012: Fix Categories (UPPERCASE) + system_currency_rates
-- ============================================================================

-- 1. Create system_currency_rates table
CREATE TABLE IF NOT EXISTS system_currency_rates (
  code TEXT PRIMARY KEY,
  rate_to_rub NUMERIC DEFAULT 1,
  rate_to_usd NUMERIC DEFAULT 1,
  prev_rate_to_rub NUMERIC DEFAULT 1,
  change_24h NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now(),
  is_popular BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  name TEXT,
  symbol TEXT
);

-- Insert default currencies if not exist
INSERT INTO system_currency_rates (code, rate_to_rub, rate_to_usd, name, symbol, sort_order)
VALUES
  ('USD', 100, 1, 'US Dollar', '$', 1),
  ('RUB', 1, 0.01, 'Russian Ruble', '₽', 2),
  ('EUR', 110, 1.1, 'Euro', '€', 3),
  ('USDT', 100, 1, 'Tether', '₮', 4)
ON CONFLICT (code) DO NOTHING;

-- 2. Fix cashbox_operation_v2: add checks, UPPERCASE categories
CREATE OR REPLACE FUNCTION cashbox_operation_v2(
  p_cashbox_id       UUID,
  p_amount           NUMERIC,
  p_category         TEXT,
  p_description      TEXT     DEFAULT NULL,
  p_reference_id     UUID     DEFAULT NULL,
  p_deal_id          UUID     DEFAULT NULL,
  p_created_by       UUID     DEFAULT '00000000-0000-0000-0000-000000000000',
  p_finance_deal_id  UUID     DEFAULT NULL,
  p_ledger_entry_type TEXT    DEFAULT NULL,
  p_ledger_amount    NUMERIC  DEFAULT NULL,
  p_ledger_currency  TEXT     DEFAULT 'USD',
  p_ledger_note      TEXT     DEFAULT NULL
)
RETURNS TABLE(new_balance NUMERIC, tx_id UUID, ledger_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_ledger_id UUID := NULL;
  v_is_archived BOOLEAN;
BEGIN
  -- Lock and check cashbox
  SELECT balance, is_archived INTO v_new_balance, v_is_archived
  FROM cashboxes
  WHERE id = p_cashbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id;
  END IF;

  IF v_is_archived THEN
    RAISE EXCEPTION 'Cashbox % is archived', p_cashbox_id;
  END IF;

  -- Check balance
  v_new_balance := v_new_balance + p_amount;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient funds: balance would be %', v_new_balance;
  END IF;

  -- Update cashbox
  UPDATE cashboxes
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_cashbox_id;

  -- Insert transaction (UPPERCASE category)
  INSERT INTO transactions(
    cashbox_id, amount, balance_after, category, description,
    reference_id, deal_id, created_by
  )
  VALUES (
    p_cashbox_id, p_amount, v_new_balance, UPPER(p_category),
    COALESCE(p_description, p_category),
    p_reference_id, p_deal_id, p_created_by
  )
  RETURNING id INTO v_tx_id;

  -- Optionally write finance_ledger entry
  IF p_finance_deal_id IS NOT NULL AND p_ledger_entry_type IS NOT NULL THEN
    INSERT INTO finance_ledger(
      finance_deal_id, entry_type, amount, currency,
      base_amount, base_currency, note,
      transaction_id, cashbox_id, created_by_employee_id
    )
    VALUES (
      p_finance_deal_id,
      p_ledger_entry_type,
      COALESCE(p_ledger_amount, ABS(p_amount)),
      p_ledger_currency,
      COALESCE(p_ledger_amount, ABS(p_amount)),
      p_ledger_currency,
      p_ledger_note,
      v_tx_id,
      p_cashbox_id,
      p_created_by
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  RETURN QUERY SELECT v_new_balance, v_tx_id, v_ledger_id;
END;
$$;

-- 3. Fix cashbox_transfer: add checks, UPPERCASE categories
CREATE OR REPLACE FUNCTION cashbox_transfer(
  p_from_cashbox_id UUID,
  p_to_cashbox_id   UUID,
  p_amount          NUMERIC,
  p_note            TEXT DEFAULT NULL,
  p_created_by      UUID DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE(from_tx_id UUID, to_tx_id UUID, from_balance NUMERIC, to_balance NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_tx UUID;
  v_to_tx UUID;
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_from_archived BOOLEAN;
  v_to_archived BOOLEAN;
BEGIN
  -- Lock both cashboxes in consistent order (by id) to prevent deadlocks
  IF p_from_cashbox_id < p_to_cashbox_id THEN
    SELECT balance, currency, is_archived INTO v_from_balance, v_from_currency, v_from_archived 
    FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
    
    SELECT balance, currency, is_archived INTO v_to_balance, v_to_currency, v_to_archived 
    FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
  ELSE
    SELECT balance, currency, is_archived INTO v_to_balance, v_to_currency, v_to_archived 
    FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
    
    SELECT balance, currency, is_archived INTO v_from_balance, v_from_currency, v_from_archived 
    FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
  END IF;

  -- Validation
  IF v_from_currency IS NULL THEN
    RAISE EXCEPTION 'Source cashbox % not found', p_from_cashbox_id;
  END IF;
  IF v_to_currency IS NULL THEN
    RAISE EXCEPTION 'Target cashbox % not found', p_to_cashbox_id;
  END IF;
  IF v_from_archived THEN
    RAISE EXCEPTION 'Source cashbox is archived';
  END IF;
  IF v_to_archived THEN
    RAISE EXCEPTION 'Target cashbox is archived';
  END IF;
  IF v_from_currency != v_to_currency THEN
    RAISE EXCEPTION 'Currency mismatch: % vs %', v_from_currency, v_to_currency;
  END IF;
  IF v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds: % available, % required', v_from_balance, p_amount;
  END IF;

  -- Withdraw from source
  v_from_balance := v_from_balance - p_amount;
  UPDATE cashboxes
    SET balance = v_from_balance,
        updated_at = now()
    WHERE id = p_from_cashbox_id;

  -- Deposit to target
  v_to_balance := v_to_balance + p_amount;
  UPDATE cashboxes
    SET balance = v_to_balance,
        updated_at = now()
    WHERE id = p_to_cashbox_id;

  -- Insert transactions (UPPERCASE)
  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by)
  VALUES (p_from_cashbox_id, -p_amount, v_from_balance, 'TRANSFER_OUT', COALESCE(p_note, 'Перевод'), p_created_by)
  RETURNING id INTO v_from_tx;

  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by, reference_id)
  VALUES (p_to_cashbox_id, p_amount, v_to_balance, 'TRANSFER_IN', COALESCE(p_note, 'Перевод'), p_created_by, v_from_tx)
  RETURNING id INTO v_to_tx;

  -- Link back
  UPDATE transactions SET reference_id = v_to_tx WHERE id = v_from_tx;

  RETURN QUERY SELECT v_from_tx, v_to_tx, v_from_balance, v_to_balance;
END;
$$;

-- 4. Fix cashbox_exchange: add checks, UPPERCASE categories, correct exchange_logs schema
CREATE OR REPLACE FUNCTION cashbox_exchange(
  p_from_cashbox_id   UUID,
  p_to_cashbox_id     UUID,
  p_from_amount       NUMERIC,
  p_to_amount         NUMERIC,
  p_rate              NUMERIC,
  p_note              TEXT DEFAULT NULL,
  p_created_by        UUID DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE(from_tx_id UUID, to_tx_id UUID, from_balance NUMERIC, to_balance NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_tx UUID;
  v_to_tx UUID;
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_from_archived BOOLEAN;
  v_to_archived BOOLEAN;
BEGIN
  -- Lock both cashboxes
  IF p_from_cashbox_id < p_to_cashbox_id THEN
    SELECT balance, currency, is_archived INTO v_from_balance, v_from_currency, v_from_archived 
    FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
    
    SELECT balance, currency, is_archived INTO v_to_balance, v_to_currency, v_to_archived 
    FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
  ELSE
    SELECT balance, currency, is_archived INTO v_to_balance, v_to_currency, v_to_archived 
    FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
    
    SELECT balance, currency, is_archived INTO v_from_balance, v_from_currency, v_from_archived 
    FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
  END IF;

  -- Validation
  IF v_from_currency IS NULL THEN
    RAISE EXCEPTION 'Source cashbox % not found', p_from_cashbox_id;
  END IF;
  IF v_to_currency IS NULL THEN
    RAISE EXCEPTION 'Target cashbox % not found', p_to_cashbox_id;
  END IF;
  IF v_from_archived THEN
    RAISE EXCEPTION 'Source cashbox is archived';
  END IF;
  IF v_to_archived THEN
    RAISE EXCEPTION 'Target cashbox is archived';
  END IF;
  IF v_from_currency = v_to_currency THEN
    RAISE EXCEPTION 'Same currency exchange not allowed, use transfer instead';
  END IF;
  IF v_from_balance < p_from_amount THEN
    RAISE EXCEPTION 'Insufficient funds: % available, % required', v_from_balance, p_from_amount;
  END IF;

  -- Withdraw from source
  v_from_balance := v_from_balance - p_from_amount;
  UPDATE cashboxes
    SET balance = v_from_balance,
        updated_at = now()
    WHERE id = p_from_cashbox_id;

  -- Deposit to target
  v_to_balance := v_to_balance + p_to_amount;
  UPDATE cashboxes
    SET balance = v_to_balance,
        updated_at = now()
    WHERE id = p_to_cashbox_id;

  -- Insert exchange transactions (UPPERCASE)
  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by)
  VALUES (p_from_cashbox_id, -p_from_amount, v_from_balance, 'EXCHANGE_OUT', 
          COALESCE(p_note, format('Обмен %s→%s @ %s', v_from_currency, v_to_currency, p_rate)), 
          p_created_by)
  RETURNING id INTO v_from_tx;

  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by, reference_id)
  VALUES (p_to_cashbox_id, p_to_amount, v_to_balance, 'EXCHANGE_IN',
          COALESCE(p_note, format('Обмен %s→%s @ %s', v_from_currency, v_to_currency, p_rate)),
          p_created_by, v_from_tx)
  RETURNING id INTO v_to_tx;

  -- Link back
  UPDATE transactions SET reference_id = v_to_tx WHERE id = v_from_tx;

  -- Log to exchange_logs with correct schema
  INSERT INTO exchange_logs(
    from_box_id, to_box_id, 
    sent_amount, sent_currency, 
    received_amount, received_currency, 
    rate, fee_amount, fee_currency, created_by
  )
  VALUES (
    p_from_cashbox_id, p_to_cashbox_id,
    p_from_amount, v_from_currency,
    p_to_amount, v_to_currency,
    p_rate, 0, v_from_currency, p_created_by
  );

  RETURN QUERY SELECT v_from_tx, v_to_tx, v_from_balance, v_to_balance;
END;
$$;
