-- ============================================================================
-- Migration 013: Payment Schedule Tracking + RPC Fix
-- ============================================================================
-- Adds amount_paid, paid_date, notes to finance_payment_schedule
-- Updates record_finance_payment RPC to handle partial payments correctly

-- 1. Add payment tracking columns
ALTER TABLE finance_payment_schedule
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Update status values to match actual usage
ALTER TABLE finance_payment_schedule
  ALTER COLUMN status SET DEFAULT 'pending';

-- Update existing rows
UPDATE finance_payment_schedule
  SET status = CASE
    WHEN status = 'PLANNED' THEN 'pending'
    WHEN status = 'PAID' THEN 'paid'
    WHEN status = 'PARTIAL' THEN 'partial'
    WHEN status = 'OVERDUE' THEN 'overdue'
    ELSE status
  END
  WHERE status IN ('PLANNED', 'PAID', 'PARTIAL', 'OVERDUE');

-- 3. Fix record_finance_payment RPC
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
  v_row_paid NUMERIC;
  v_row_total_due NUMERIC;
BEGIN
  -- Apply payment to unpaid schedule rows (FIFO by due_date)
  FOR v_schedule_row IN
    SELECT id, due_date, principal_due, interest_due, 
           COALESCE(amount_paid, 0) AS amount_paid, status
    FROM finance_payment_schedule
    WHERE finance_deal_id = p_finance_deal_id
      AND status IN ('pending', 'partial', 'overdue')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    -- Calculate remaining debt for this row
    v_row_total_due := v_schedule_row.principal_due + v_schedule_row.interest_due;
    v_row_paid := v_schedule_row.amount_paid;

    -- Allocate to interest first, then principal
    v_to_interest := LEAST(v_remaining, GREATEST(0, v_schedule_row.interest_due - v_row_paid));
    v_remaining := v_remaining - v_to_interest;
    v_row_paid := v_row_paid + v_to_interest;

    v_to_principal := LEAST(v_remaining, GREATEST(0, v_schedule_row.principal_due - (v_row_paid - v_to_interest)));
    v_remaining := v_remaining - v_to_principal;
    v_row_paid := v_row_paid + v_to_principal;

    -- Update schedule row
    UPDATE finance_payment_schedule
    SET amount_paid = v_row_paid,
        paid_date = CASE WHEN v_row_paid >= v_row_total_due THEN CURRENT_DATE ELSE paid_date END,
        status = CASE
          WHEN v_row_paid >= v_row_total_due THEN 'paid'
          WHEN v_row_paid > 0 THEN 'partial'
          ELSE status
        END,
        notes = COALESCE(notes || ' | ', '') || COALESCE(p_note, ''),
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
        p_category := 'FINANCE_PRINCIPAL_REPAYMENT',
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
        p_category := 'FINANCE_INTEREST_PAYMENT',
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

-- 4. VIEW: payment schedule summary by deal
CREATE OR REPLACE VIEW v_payment_schedule_summary AS
SELECT
  finance_deal_id,
  COUNT(id) AS total_payments,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
  SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_count,
  SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
  SUM(principal_due + interest_due) AS total_scheduled,
  SUM(COALESCE(amount_paid, 0)) AS total_paid,
  SUM(principal_due + interest_due) - SUM(COALESCE(amount_paid, 0)) AS total_remaining
FROM finance_payment_schedule
GROUP BY finance_deal_id;
