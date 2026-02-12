-- ============================================================================
-- Migration 011: Atomic Transfer/Exchange + Proper Categories
-- ============================================================================
-- Adds atomic cashbox_transfer and cashbox_exchange RPCs,
-- proper category constraints, and helper VIEWs for reporting.

-- 1. Atomic cashbox transfer (same currency)
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
  v_currency TEXT;
BEGIN
  -- Lock both cashboxes in consistent order (by id) to prevent deadlocks
  IF p_from_cashbox_id < p_to_cashbox_id THEN
    PERFORM 1 FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
    PERFORM 1 FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
    PERFORM 1 FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
  END IF;

  -- Get currency from source cashbox
  SELECT currency INTO v_currency FROM cashboxes WHERE id = p_from_cashbox_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source cashbox % not found', p_from_cashbox_id;
  END IF;

  -- Withdraw from source
  UPDATE cashboxes
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE id = p_from_cashbox_id
    RETURNING balance INTO v_from_balance;

  -- Deposit to target
  UPDATE cashboxes
    SET balance = balance + p_amount,
        updated_at = now()
    WHERE id = p_to_cashbox_id
    RETURNING balance INTO v_to_balance;

  -- Insert transactions
  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by)
  VALUES (p_from_cashbox_id, -p_amount, v_from_balance, 'transfer_out', COALESCE(p_note, 'Перевод'), p_created_by)
  RETURNING id INTO v_from_tx;

  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by, reference_id)
  VALUES (p_to_cashbox_id, p_amount, v_to_balance, 'transfer_in', COALESCE(p_note, 'Перевод'), p_created_by, v_from_tx)
  RETURNING id INTO v_to_tx;

  -- Link back
  UPDATE transactions SET reference_id = v_to_tx WHERE id = v_from_tx;

  RETURN QUERY SELECT v_from_tx, v_to_tx, v_from_balance, v_to_balance;
END;
$$;

-- 2. Atomic cashbox exchange (different currencies)
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
BEGIN
  -- Lock both cashboxes
  IF p_from_cashbox_id < p_to_cashbox_id THEN
    SELECT currency INTO v_from_currency FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
    SELECT currency INTO v_to_currency FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
  ELSE
    SELECT currency INTO v_to_currency FROM cashboxes WHERE id = p_to_cashbox_id FOR UPDATE;
    SELECT currency INTO v_from_currency FROM cashboxes WHERE id = p_from_cashbox_id FOR UPDATE;
  END IF;

  IF v_from_currency IS NULL THEN
    RAISE EXCEPTION 'Source cashbox % not found', p_from_cashbox_id;
  END IF;
  IF v_to_currency IS NULL THEN
    RAISE EXCEPTION 'Target cashbox % not found', p_to_cashbox_id;
  END IF;

  -- Withdraw from source
  UPDATE cashboxes
    SET balance = balance - p_from_amount,
        updated_at = now()
    WHERE id = p_from_cashbox_id
    RETURNING balance INTO v_from_balance;

  -- Deposit to target
  UPDATE cashboxes
    SET balance = balance + p_to_amount,
        updated_at = now()
    WHERE id = p_to_cashbox_id
    RETURNING balance INTO v_to_balance;

  -- Insert exchange transactions
  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by)
  VALUES (p_from_cashbox_id, -p_from_amount, v_from_balance, 'exchange_out', 
          COALESCE(p_note, format('Обмен %s→%s @ %s', v_from_currency, v_to_currency, p_rate)), 
          p_created_by)
  RETURNING id INTO v_from_tx;

  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, created_by, reference_id)
  VALUES (p_to_cashbox_id, p_to_amount, v_to_balance, 'exchange_in',
          COALESCE(p_note, format('Обмен %s→%s @ %s', v_from_currency, v_to_currency, p_rate)),
          p_created_by, v_from_tx)
  RETURNING id INTO v_to_tx;

  -- Link back
  UPDATE transactions SET reference_id = v_to_tx WHERE id = v_from_tx;

  -- Also log to exchange_logs if exists
  INSERT INTO exchange_logs(
    from_currency, to_currency, from_amount, to_amount, rate,
    from_cashbox_id, to_cashbox_id, note, created_by
  )
  VALUES (
    v_from_currency, v_to_currency, p_from_amount, p_to_amount, p_rate,
    p_from_cashbox_id, p_to_cashbox_id, p_note, p_created_by
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_from_tx, v_to_tx, v_from_balance, v_to_balance;
END;
$$;

-- 3. Helper function: record payment against schedule + update ledger
-- This applies a payment to finance_payment_schedule rows and writes ledger entries
CREATE OR REPLACE FUNCTION record_finance_payment(
  p_finance_deal_id   UUID,
  p_payment_amount    NUMERIC,
  p_currency          TEXT,
  p_cashbox_id        UUID DEFAULT NULL,
  p_note              TEXT DEFAULT NULL,
  p_created_by        UUID DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE(
  principal_paid NUMERIC,
  interest_paid NUMERIC,
  ledger_ids UUID[]
)
LANGUAGE plpgsql AS $$
DECLARE
  v_remaining NUMERIC := p_payment_amount;
  v_schedule_row RECORD;
  v_to_principal NUMERIC;
  v_to_interest NUMERIC;
  v_principal_total NUMERIC := 0;
  v_interest_total NUMERIC := 0;
  v_ledger_ids UUID[] := ARRAY[]::UUID[];
  v_ledger_id UUID;
  v_tx_id UUID;
BEGIN
  -- Apply payment to unpaid schedule rows (FIFO by due_date)
  FOR v_schedule_row IN
    SELECT id, due_date, principal_due, interest_due, amount_paid, status
    FROM finance_payment_schedule
    WHERE finance_deal_id = p_finance_deal_id
      AND status IN ('pending', 'partial')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    -- Calculate how much to allocate to this row
    v_to_interest := LEAST(v_remaining, v_schedule_row.interest_due - COALESCE(v_schedule_row.amount_paid, 0));
    v_remaining := v_remaining - v_to_interest;

    v_to_principal := LEAST(v_remaining, v_schedule_row.principal_due);
    v_remaining := v_remaining - v_to_principal;

    -- Update schedule row
    UPDATE finance_payment_schedule
    SET amount_paid = COALESCE(amount_paid, 0) + v_to_interest + v_to_principal,
        status = CASE
          WHEN (COALESCE(amount_paid, 0) + v_to_interest + v_to_principal) >= (principal_due + interest_due) THEN 'paid'
          WHEN (COALESCE(amount_paid, 0) + v_to_interest + v_to_principal) > 0 THEN 'partial'
          ELSE 'pending'
        END,
        updated_at = now()
    WHERE id = v_schedule_row.id;

    v_principal_total := v_principal_total + v_to_principal;
    v_interest_total := v_interest_total + v_to_interest;
  END LOOP;

  -- Write ledger entries (optionally link to cashbox)
  IF v_principal_total > 0 THEN
    IF p_cashbox_id IS NOT NULL THEN
      -- Use v2 RPC for atomicity
      SELECT tx_id, ledger_id INTO v_tx_id, v_ledger_id
      FROM cashbox_operation_v2(
        p_cashbox_id := p_cashbox_id,
        p_amount := v_principal_total,
        p_category := 'finance_principal_repayment',
        p_description := p_note,
        p_created_by := p_created_by,
        p_finance_deal_id := p_finance_deal_id,
        p_ledger_entry_type := 'principal_repayment',
        p_ledger_amount := v_principal_total,
        p_ledger_currency := p_currency,
        p_ledger_note := p_note
      );
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    ELSE
      INSERT INTO finance_ledger(finance_deal_id, entry_type, amount, currency, base_amount, base_currency, note, created_by_employee_id)
      VALUES (p_finance_deal_id, 'principal_repayment', v_principal_total, p_currency, v_principal_total, p_currency, p_note, p_created_by)
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;
  END IF;

  IF v_interest_total > 0 THEN
    IF p_cashbox_id IS NOT NULL THEN
      SELECT tx_id, ledger_id INTO v_tx_id, v_ledger_id
      FROM cashbox_operation_v2(
        p_cashbox_id := p_cashbox_id,
        p_amount := v_interest_total,
        p_category := 'finance_interest_payment',
        p_description := p_note,
        p_created_by := p_created_by,
        p_finance_deal_id := p_finance_deal_id,
        p_ledger_entry_type := 'interest_payment',
        p_ledger_amount := v_interest_total,
        p_ledger_currency := p_currency,
        p_ledger_note := p_note
      );
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    ELSE
      INSERT INTO finance_ledger(finance_deal_id, entry_type, amount, currency, base_amount, base_currency, note, created_by_employee_id)
      VALUES (p_finance_deal_id, 'interest_payment', v_interest_total, p_currency, v_interest_total, p_currency, p_note, p_created_by)
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;
  END IF;

  RETURN QUERY SELECT v_principal_total, v_interest_total, v_ledger_ids;
END;
$$;

-- 4. VIEW: cashbox summary by currency
CREATE OR REPLACE VIEW v_cashbox_summary AS
SELECT
  c.currency,
  COUNT(c.id) AS cashbox_count,
  SUM(c.balance) AS total_balance,
  SUM(c.initial_balance) AS total_initial,
  SUM(c.balance) - SUM(c.initial_balance) AS net_change
FROM cashboxes c
WHERE c.is_archived = false
GROUP BY c.currency;

-- 5. VIEW: transaction summary by category (last 30 days)
CREATE OR REPLACE VIEW v_transaction_summary_30d AS
SELECT
  t.category,
  COUNT(t.id) AS tx_count,
  SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS total_in,
  SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) AS total_out,
  SUM(t.amount) AS net_amount
FROM transactions t
WHERE t.created_at >= (now() - interval '30 days')
GROUP BY t.category
ORDER BY tx_count DESC;

-- 6. Add comment to clarify allowed transaction categories
COMMENT ON COLUMN transactions.category IS 
  'Allowed: deposit, withdrawal, transfer_in, transfer_out, exchange_in, exchange_out, finance_disbursement, finance_principal_repayment, finance_interest_payment, finance_fee, finance_penalty, deal_payment, deal_expense, adjustment, other';
