-- ============================================================================
-- Migration 014: Fix Finance Payment RPC + UPPERCASE Status + Atomic Cashbox
-- ============================================================================

-- A) Вернуть статусы графика к UPPERCASE
ALTER TABLE finance_payment_schedule ALTER COLUMN status SET DEFAULT 'PLANNED';

UPDATE finance_payment_schedule SET status =
  CASE status
    WHEN 'pending' THEN 'PLANNED'
    WHEN 'partial' THEN 'PARTIAL'
    WHEN 'paid' THEN 'PAID'
    WHEN 'overdue' THEN 'OVERDUE'
    ELSE status
  END;

-- B) Добавить точный трекинг оплаты по графику
ALTER TABLE finance_payment_schedule
  ADD COLUMN IF NOT EXISTS principal_paid NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_paid NUMERIC DEFAULT 0;

-- Мигрировать amount_paid в principal_paid + interest_paid (если amount_paid уже заполнен)
UPDATE finance_payment_schedule
SET 
  interest_paid = LEAST(COALESCE(amount_paid, 0), interest_due),
  principal_paid = GREATEST(0, COALESCE(amount_paid, 0) - interest_due)
WHERE amount_paid > 0;

-- C) Переписать record_finance_payment для атомарной работы с кассой
CREATE OR REPLACE FUNCTION record_finance_payment(
  p_finance_deal_id UUID,
  p_payment_amount NUMERIC,
  p_currency TEXT,
  p_cashbox_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000'
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
  v_interest_remaining NUMERIC;
  v_principal_remaining NUMERIC;
  v_to_interest NUMERIC;
  v_to_principal NUMERIC;
  v_principal_total NUMERIC := 0;
  v_interest_total NUMERIC := 0;
  v_ledger_ids UUID[] := ARRAY[]::UUID[];
  v_ledger_id UUID;
  v_tx_id UUID;
  v_new_balance NUMERIC;
  v_cashbox_currency TEXT;
  v_cashbox_archived BOOLEAN;
BEGIN
  -- 1) Распределить платёж по графику (FIFO)
  FOR v_schedule_row IN
    SELECT id, due_date, principal_due, interest_due, 
           COALESCE(principal_paid, 0) AS principal_paid,
           COALESCE(interest_paid, 0) AS interest_paid,
           status
    FROM finance_payment_schedule
    WHERE finance_deal_id = p_finance_deal_id
      AND status IN ('PLANNED', 'PARTIAL', 'OVERDUE')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    -- Сколько осталось оплатить по этой строке
    v_interest_remaining := GREATEST(0, v_schedule_row.interest_due - v_schedule_row.interest_paid);
    v_principal_remaining := GREATEST(0, v_schedule_row.principal_due - v_schedule_row.principal_paid);

    -- Сначала погашаем проценты, потом тело
    v_to_interest := LEAST(v_remaining, v_interest_remaining);
    v_remaining := v_remaining - v_to_interest;

    v_to_principal := LEAST(v_remaining, v_principal_remaining);
    v_remaining := v_remaining - v_to_principal;

    -- Обновить строку графика
    UPDATE finance_payment_schedule
    SET 
      interest_paid = interest_paid + v_to_interest,
      principal_paid = principal_paid + v_to_principal,
      amount_paid = (interest_paid + v_to_interest) + (principal_paid + v_to_principal),
      paid_date = CASE 
        WHEN (interest_paid + v_to_interest >= interest_due) AND (principal_paid + v_to_principal >= principal_due)
        THEN CURRENT_DATE
        ELSE paid_date
      END,
      status = CASE
        WHEN (interest_paid + v_to_interest >= interest_due) AND (principal_paid + v_to_principal >= principal_due) THEN 'PAID'
        WHEN (interest_paid + v_to_interest + principal_paid + v_to_principal) > 0 THEN 'PARTIAL'
        ELSE status
      END,
      notes = COALESCE(notes || ' | ', '') || COALESCE(p_note, ''),
      updated_at = now()
    WHERE id = v_schedule_row.id;

    v_principal_total := v_principal_total + v_to_principal;
    v_interest_total := v_interest_total + v_to_interest;
  END LOOP;

  -- 2) Если указана касса — обновить её и записать transactions + ledger атомарно
  IF p_cashbox_id IS NOT NULL THEN
    -- Заблокировать кассу и проверить
    SELECT balance, currency, is_archived 
    INTO v_new_balance, v_cashbox_currency, v_cashbox_archived
    FROM cashboxes 
    WHERE id = p_cashbox_id 
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id;
    END IF;
    IF v_cashbox_archived THEN
      RAISE EXCEPTION 'Cashbox % is archived', p_cashbox_id;
    END IF;
    IF v_cashbox_currency != p_currency THEN
      RAISE EXCEPTION 'Currency mismatch: cashbox is %, payment is %', v_cashbox_currency, p_currency;
    END IF;

    -- Обновить баланс кассы
    v_new_balance := v_new_balance + p_payment_amount;
    UPDATE cashboxes 
    SET balance = v_new_balance, updated_at = now() 
    WHERE id = p_cashbox_id;

    -- Вставить одну транзакцию в transactions (категория DEAL_PAYMENT)
    INSERT INTO transactions(
      cashbox_id, amount, balance_after, category, description, created_by
    )
    VALUES (
      p_cashbox_id,
      p_payment_amount,
      v_new_balance,
      'DEAL_PAYMENT',
      COALESCE(p_note, 'Платёж по фин.сделке'),
      p_created_by
    )
    RETURNING id INTO v_tx_id;

    -- Вставить 2 записи в finance_ledger (если суммы > 0)
    IF v_interest_total > 0 THEN
      INSERT INTO finance_ledger(
        finance_deal_id, entry_type, amount, currency, 
        base_amount, base_currency, note,
        transaction_id, cashbox_id, created_by_employee_id
      )
      VALUES (
        p_finance_deal_id, 'interest_payment', v_interest_total, p_currency,
        v_interest_total, p_currency, p_note,
        v_tx_id, p_cashbox_id, p_created_by
      )
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;

    IF v_principal_total > 0 THEN
      INSERT INTO finance_ledger(
        finance_deal_id, entry_type, amount, currency,
        base_amount, base_currency, note,
        transaction_id, cashbox_id, created_by_employee_id
      )
      VALUES (
        p_finance_deal_id, 'principal_repayment', v_principal_total, p_currency,
        v_principal_total, p_currency, p_note,
        v_tx_id, p_cashbox_id, p_created_by
      )
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;

  ELSE
    -- Касса не указана — только finance_ledger
    IF v_interest_total > 0 THEN
      INSERT INTO finance_ledger(
        finance_deal_id, entry_type, amount, currency,
        base_amount, base_currency, note, created_by_employee_id
      )
      VALUES (
        p_finance_deal_id, 'interest_payment', v_interest_total, p_currency,
        v_interest_total, p_currency, p_note, p_created_by
      )
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;

    IF v_principal_total > 0 THEN
      INSERT INTO finance_ledger(
        finance_deal_id, entry_type, amount, currency,
        base_amount, base_currency, note, created_by_employee_id
      )
      VALUES (
        p_finance_deal_id, 'principal_repayment', v_principal_total, p_currency,
        v_principal_total, p_currency, p_note, p_created_by
      )
      RETURNING id INTO v_ledger_id;
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
    END IF;
  END IF;

  RETURN QUERY SELECT v_principal_total, v_interest_total, v_ledger_ids;
END;
$$;

-- D) Обновить VIEW для UPPERCASE статусов
CREATE OR REPLACE VIEW v_payment_schedule_summary AS
SELECT
  finance_deal_id,
  COUNT(id) AS total_payments,
  SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
  SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) AS partial_count,
  SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) AS overdue_count,
  SUM(principal_due + interest_due) AS total_scheduled,
  SUM(COALESCE(principal_paid, 0) + COALESCE(interest_paid, 0)) AS total_paid,
  SUM(principal_due + interest_due) - SUM(COALESCE(principal_paid, 0) + COALESCE(interest_paid, 0)) AS total_remaining
FROM finance_payment_schedule
GROUP BY finance_deal_id;

COMMENT ON FUNCTION record_finance_payment IS 
  'Records payment against schedule (FIFO), updates cashbox atomically if specified, writes ledger entries. Returns principal_paid, interest_paid, ledger_ids.';
