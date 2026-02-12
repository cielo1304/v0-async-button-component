-- Migration 010: cashbox_operation_v2 RPC, finance_ledger linking, VIEWs

-- 1. Add linking columns to finance_ledger
ALTER TABLE finance_ledger
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS cashbox_id UUID REFERENCES cashboxes(id);

-- 2. cashbox_operation_v2: atomic cashbox op that also writes a finance_ledger row
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
BEGIN
  UPDATE cashboxes SET balance = balance + p_amount, updated_at = now()
    WHERE id = p_cashbox_id RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id; END IF;

  INSERT INTO transactions(cashbox_id, amount, balance_after, category, description, reference_id, deal_id, created_by)
  VALUES (p_cashbox_id, p_amount, v_new_balance, p_category, COALESCE(p_description, p_category), p_reference_id, p_deal_id, p_created_by)
  RETURNING id INTO v_tx_id;

  IF p_finance_deal_id IS NOT NULL AND p_ledger_entry_type IS NOT NULL THEN
    INSERT INTO finance_ledger(finance_deal_id, entry_type, amount, currency, base_amount, base_currency, note, transaction_id, cashbox_id, created_by_employee_id)
    VALUES (p_finance_deal_id, p_ledger_entry_type, COALESCE(p_ledger_amount, ABS(p_amount)), p_ledger_currency, COALESCE(p_ledger_amount, ABS(p_amount)), p_ledger_currency, p_ledger_note, v_tx_id, p_cashbox_id, p_created_by)
    RETURNING id INTO v_ledger_id;
  END IF;

  RETURN QUERY SELECT v_new_balance, v_tx_id, v_ledger_id;
END;
$$;

-- 3. VIEW: latest system rates
CREATE OR REPLACE VIEW v_latest_rates AS
SELECT code, rate_to_usd, rate_to_rub, last_updated FROM system_currency_rates WHERE rate_to_usd IS NOT NULL;

-- 4. VIEW: finance deal P&L summary
CREATE OR REPLACE VIEW v_finance_deal_pnl AS
SELECT fl.finance_deal_id, fd.principal_amount, fd.contract_currency, fd.rate_percent, fd.term_months,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'disbursement'), 0) AS total_disbursed,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type IN ('principal_repayment','early_repayment')), 0) AS total_principal_repaid,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'interest_payment'), 0) AS total_interest_received,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'fee'), 0) AS total_fees,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'penalty'), 0) AS total_penalties,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'disbursement'), 0)
    - COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type IN ('principal_repayment','early_repayment')), 0) AS outstanding_principal,
  COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'interest_payment'), 0)
    + COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'fee'), 0)
    + COALESCE(SUM(fl.amount) FILTER (WHERE fl.entry_type = 'penalty'), 0) AS net_income,
  COUNT(fl.id) AS entry_count
FROM finance_ledger fl JOIN finance_deals fd ON fd.id = fl.finance_deal_id
GROUP BY fl.finance_deal_id, fd.principal_amount, fd.contract_currency, fd.rate_percent, fd.term_months;

-- 5. VIEW: cashbox balance verification
CREATE OR REPLACE VIEW v_cashbox_verified_balance AS
SELECT c.id AS cashbox_id, c.name, c.currency, c.balance AS stored_balance,
  c.initial_balance + COALESCE(SUM(t.amount), 0) AS computed_balance,
  c.balance - (c.initial_balance + COALESCE(SUM(t.amount), 0)) AS drift
FROM cashboxes c LEFT JOIN transactions t ON t.cashbox_id = c.id
GROUP BY c.id, c.name, c.currency, c.balance, c.initial_balance;
