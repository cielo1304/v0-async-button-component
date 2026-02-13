-- =============================================
-- 026: Fix Auto Payment RPC Overload & P&L Integration
-- Purpose: Remove bad overload, add P&L recalc to correct signature, make expense_date null-safe
-- =============================================

-- =====================================================
-- PART A: Remove bad auto_record_payment_v2 overload from 025
-- =====================================================

DROP FUNCTION IF EXISTS auto_record_payment_v2(UUID, UUID, NUMERIC, DATE, TEXT, UUID);

-- =====================================================
-- PART B: Replace auto_record_payment_v2 with correct signature + P&L recalc
-- =====================================================

CREATE OR REPLACE FUNCTION auto_record_payment_v2(
  p_deal_id UUID,
  p_cashbox_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_schedule_payment_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_deal_record RECORD;
  v_cashbox_currency TEXT;
  v_tx_id UUID;
  v_payment_id UUID;
  v_actor_id UUID;
  v_new_paid_amount NUMERIC;
  v_payment_amount NUMERIC;
  v_total_paid NUMERIC;
  v_total_debt NUMERIC;
  v_new_status TEXT;
  v_sale_price NUMERIC;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Determine actor
  v_actor_id := COALESCE(p_actor_employee_id, '00000000-0000-0000-0000-000000000000');

  -- Lock deal for update
  SELECT * INTO v_deal_record
  FROM auto_deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  -- Validate cashbox currency
  SELECT currency INTO v_cashbox_currency
  FROM cashboxes
  WHERE id = p_cashbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashbox not found: %', p_cashbox_id;
  END IF;

  IF v_cashbox_currency != p_currency THEN
    RAISE EXCEPTION 'Cashbox currency % does not match payment currency %', v_cashbox_currency, p_currency;
  END IF;

  -- Call cashbox_operation_v2 to create transaction
  SELECT tx_id INTO v_tx_id
  FROM cashbox_operation_v2(
    p_cashbox_id := p_cashbox_id,
    p_amount := p_amount,
    p_category := 'DEAL_PAYMENT',
    p_description := COALESCE(p_note, 'Auto payment for deal: ' || p_deal_id::TEXT),
    p_reference_id := p_schedule_payment_id,
    p_deal_id := p_deal_id,
    p_created_by := v_actor_id
  );

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create cashbox transaction';
  END IF;

  -- Update or create payment record
  IF p_schedule_payment_id IS NOT NULL THEN
    -- Update scheduled payment
    SELECT amount INTO v_payment_amount
    FROM auto_payments
    WHERE id = p_schedule_payment_id;

    UPDATE auto_payments
    SET paid_amount = paid_amount + p_amount,
        cashbox_id = p_cashbox_id,
        transaction_id = v_tx_id,
        paid_date = CASE 
          WHEN paid_amount + p_amount >= amount THEN CURRENT_DATE 
          ELSE paid_date 
        END,
        status = CASE 
          WHEN paid_amount + p_amount >= amount THEN 'PAID'
          WHEN paid_amount + p_amount > 0 THEN 'PARTIAL'
          ELSE status
        END,
        created_by_employee_id = v_actor_id
    WHERE id = p_schedule_payment_id
    RETURNING id, paid_amount INTO v_payment_id, v_new_paid_amount;

  ELSE
    -- Create manual payment record
    INSERT INTO auto_payments (
      deal_id,
      payment_type,
      direction,
      amount,
      currency,
      paid_amount,
      paid_date,
      status,
      cashbox_id,
      transaction_id,
      payment_number,
      created_by_employee_id
    )
    SELECT
      p_deal_id,
      'OTHER',
      'IN',
      p_amount,
      p_currency,
      p_amount,
      CURRENT_DATE,
      'PAID',
      p_cashbox_id,
      v_tx_id,
      COALESCE(MAX(payment_number), 0) + 1,
      v_actor_id
    FROM auto_payments
    WHERE deal_id = p_deal_id
    RETURNING id INTO v_payment_id;

    v_new_paid_amount := p_amount;
  END IF;

  -- Recalculate deal totals
  SELECT COALESCE(SUM(paid_amount), 0)
  INTO v_total_paid
  FROM auto_payments
  WHERE deal_id = p_deal_id AND direction = 'IN';

  -- Determine sale price
  v_sale_price := COALESCE(v_deal_record.sale_price, v_deal_record.total_amount, 0);

  v_total_debt := GREATEST(0, v_sale_price - v_total_paid);

  -- Determine new status
  IF v_total_debt = 0 AND v_sale_price > 0 THEN
    v_new_status := 'COMPLETED';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'IN_PROGRESS';
  ELSE
    v_new_status := COALESCE(v_deal_record.status, 'NEW');
  END IF;

  -- Update deal
  UPDATE auto_deals
  SET total_paid = v_total_paid,
      total_debt = v_total_debt,
      status = v_new_status
  WHERE id = p_deal_id;

  -- Write audit log
  INSERT INTO audit_log_v2 (
    actor_employee_id,
    action,
    module,
    entity_table,
    entity_id,
    before,
    after
  ) VALUES (
    v_actor_id,
    'auto_payment',
    'auto',
    'auto_deals',
    p_deal_id,
    jsonb_build_object(
      'total_paid', v_deal_record.total_paid,
      'total_debt', v_deal_record.total_debt,
      'status', v_deal_record.status
    ),
    jsonb_build_object(
      'amount', p_amount,
      'currency', p_currency,
      'tx_id', v_tx_id,
      'payment_id', v_payment_id,
      'total_paid', v_total_paid,
      'total_debt', v_total_debt,
      'status', v_new_status
    )
  );

  -- NEW: Recalculate P&L after payment
  BEGIN
    PERFORM auto_recalc_pnl_v2(p_deal_id);
  EXCEPTION WHEN OTHERS THEN
    -- Don't break payment if P&L calc fails
    NULL;
  END;

  RETURN v_payment_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'auto_record_payment_v2 failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_record_payment_v2 IS 'Atomically record auto payment through cashbox_operation_v2 with full audit trail and P&L recalc';

-- =====================================================
-- PART C: Fix auto_record_expense_v2 for clean DB compatibility
-- =====================================================

-- Drop any existing overloads
DROP FUNCTION IF EXISTS auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID, DATE
);

CREATE OR REPLACE FUNCTION auto_record_expense_v2(
  p_car_id UUID,
  p_deal_id UUID DEFAULT NULL,
  p_cashbox_id UUID DEFAULT NULL,
  p_amount NUMERIC,
  p_currency TEXT,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_paid_by TEXT DEFAULT 'COMPANY',
  p_owner_share NUMERIC DEFAULT 0,
  p_actor_employee_id UUID DEFAULT NULL,
  p_expense_date DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_company_part NUMERIC;
  v_tx_id UUID;
  v_actor_id UUID;
  v_active_deal_id UUID;
  v_safe_expense_date DATE;
  v_cashbox_currency TEXT;
BEGIN
  -- Set actor
  v_actor_id := COALESCE(p_actor_employee_id, '00000000-0000-0000-0000-000000000000');

  -- Make expense_date null-safe
  v_safe_expense_date := COALESCE(p_expense_date, CURRENT_DATE);

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;

  -- Validate car exists in cars table (NOT auto_cars)
  IF NOT EXISTS (SELECT 1 FROM cars WHERE id = p_car_id) THEN
    RAISE EXCEPTION 'Car not found: %', p_car_id;
  END IF;

  -- Calculate company part based on paid_by logic
  IF p_paid_by = 'COMPANY' THEN
    v_company_part := p_amount;
  ELSIF p_paid_by = 'OWNER' THEN
    v_company_part := 0;
  ELSIF p_paid_by = 'SHARED' THEN
    v_company_part := GREATEST(0, p_amount - COALESCE(p_owner_share, 0));
  ELSE
    RAISE EXCEPTION 'Invalid paid_by value: %. Must be COMPANY, OWNER, or SHARED', p_paid_by;
  END IF;

  -- STEP 1: Create expense record FIRST (before cashbox transaction)
  -- Insert only fields that exist in auto_expenses table
  INSERT INTO auto_expenses (
    car_id,
    deal_id,
    type,
    amount,
    currency,
    description,
    paid_by,
    owner_share,
    cashbox_id,
    transaction_id,
    created_by_employee_id,
    expense_date
  ) VALUES (
    p_car_id,
    p_deal_id,
    p_type,
    p_amount,
    p_currency,
    p_description,
    p_paid_by,
    COALESCE(p_owner_share, 0),
    NULL,  -- Will be updated after cashbox operation
    NULL,  -- Will be updated after cashbox operation
    v_actor_id,
    v_safe_expense_date
  )
  RETURNING id INTO v_expense_id;

  -- STEP 2: Create cashbox transaction (if cashbox provided and company part > 0)
  IF p_cashbox_id IS NOT NULL AND v_company_part > 0 THEN
    -- Validate cashbox currency matches
    SELECT currency INTO v_cashbox_currency
    FROM cashboxes
    WHERE id = p_cashbox_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cashbox not found: %', p_cashbox_id;
    END IF;

    IF v_cashbox_currency != p_currency THEN
      RAISE EXCEPTION 'Cashbox currency % does not match expense currency %', v_cashbox_currency, p_currency;
    END IF;

    -- Create transaction with category EXPENSE (not AUTO_EXPENSE)
    SELECT tx_id INTO v_tx_id
    FROM cashbox_operation_v2(
      p_cashbox_id := p_cashbox_id,
      p_amount := -v_company_part,
      p_category := 'EXPENSE',
      p_description := COALESCE(p_description, 'Auto expense: ' || p_type),
      p_reference_id := v_expense_id,
      p_deal_id := p_deal_id,
      p_created_by := v_actor_id
    );

    IF v_tx_id IS NULL THEN
      RAISE EXCEPTION 'Failed to create cashbox transaction for expense';
    END IF;

    -- STEP 3: Update expense with transaction_id and cashbox_id
    UPDATE auto_expenses
    SET transaction_id = v_tx_id,
        cashbox_id = p_cashbox_id
    WHERE id = v_expense_id;
  END IF;

  -- STEP 4: Update car cost_price with FULL amount (not just company_part)
  UPDATE cars
  SET cost_price = COALESCE(cost_price, 0) + p_amount
  WHERE id = p_car_id;

  -- STEP 5: Write audit log
  INSERT INTO audit_log_v2 (
    actor_employee_id,
    action,
    module,
    entity_table,
    entity_id,
    before,
    after
  ) VALUES (
    v_actor_id,
    'auto_expense',
    'auto',
    'auto_expenses',
    v_expense_id,
    NULL,
    jsonb_build_object(
      'car_id', p_car_id,
      'deal_id', p_deal_id,
      'type', p_type,
      'amount', p_amount,
      'currency', p_currency,
      'paid_by', p_paid_by,
      'owner_share', p_owner_share,
      'company_part', v_company_part,
      'tx_id', v_tx_id,
      'expense_date', v_safe_expense_date
    )
  );

  -- STEP 6: Recalculate P&L (wrapped in exception handler)
  IF p_deal_id IS NOT NULL THEN
    -- Direct deal specified
    BEGIN
      PERFORM auto_recalc_pnl_v2(p_deal_id);
    EXCEPTION WHEN OTHERS THEN
      -- Don't break expense creation if P&L calc fails
      NULL;
    END;
  ELSE
    -- No deal specified: try to recalc P&L for active deal on this car
    BEGIN
      SELECT id INTO v_active_deal_id
      FROM auto_deals
      WHERE car_id = p_car_id 
        AND status IN ('NEW', 'IN_PROGRESS')
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_active_deal_id IS NOT NULL THEN
        PERFORM auto_recalc_pnl_v2(v_active_deal_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_record_expense_v2 IS 'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc';
