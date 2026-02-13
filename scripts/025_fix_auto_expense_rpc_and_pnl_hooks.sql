-- =====================================================
-- Migration 025: Fix auto_record_expense_v2 + P&L hooks after payments
-- =====================================================
-- GOAL:
-- 1. auto_record_expense_v2 creates cashbox tx with actor+deal link
-- 2. P&L recalculates after payments and expenses
-- 3. expense_date parameter works
-- 4. Expenses link to transactions via reference_id = expense_id

-- =====================================================
-- PART A: Fix auto_record_expense_v2 with correct cashbox integration
-- =====================================================

-- Drop old signature to avoid overload conflicts
DROP FUNCTION IF EXISTS auto_record_expense_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID);

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
  p_expense_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
  v_actor_id UUID;
  v_company_part NUMERIC;
  v_tx_id UUID;
  v_expense_id UUID;
  v_cashbox_currency TEXT;
  v_active_deal_id UUID;
BEGIN
  -- Set actor
  v_actor_id := COALESCE(p_actor_employee_id, '00000000-0000-0000-0000-000000000000');

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;

  -- Calculate company part
  CASE p_paid_by
    WHEN 'COMPANY' THEN
      v_company_part := p_amount;
    WHEN 'SHARED' THEN
      v_company_part := GREATEST(0, p_amount - COALESCE(p_owner_share, 0));
    WHEN 'OWNER' THEN
      v_company_part := 0;
    ELSE
      RAISE EXCEPTION 'Invalid paid_by value: %', p_paid_by;
  END CASE;

  -- STEP 1: Insert expense record first (without transaction_id)
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
    NULL,  -- Will update after cashbox_operation_v2
    NULL,  -- Will update after cashbox_operation_v2
    v_actor_id,
    p_expense_date
  ) RETURNING id INTO v_expense_id;

  -- STEP 2: If company pays, create cashbox transaction
  IF v_company_part > 0 THEN
    IF p_cashbox_id IS NULL THEN
      RAISE EXCEPTION 'Cashbox required when company pays for expense';
    END IF;

    -- Check cashbox exists and currency matches
    SELECT currency INTO v_cashbox_currency
    FROM cashboxes
    WHERE id = p_cashbox_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cashbox not found: %', p_cashbox_id;
    END IF;

    IF v_cashbox_currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'Currency mismatch: cashbox=%, expense=%', v_cashbox_currency, p_currency;
    END IF;

    -- Call cashbox_operation_v2 with proper parameters
    -- p_reference_id = expense_id, p_deal_id = deal_id for linking
    SELECT tx_id INTO v_tx_id
    FROM cashbox_operation_v2(
      p_cashbox_id := p_cashbox_id,
      p_amount := -v_company_part,
      p_category := 'EXPENSE',
      p_description := COALESCE(p_description, 'Auto expense: ' || p_type),
      p_reference_id := v_expense_id,  -- Link to expense record
      p_deal_id := p_deal_id,          -- Link to deal if exists
      p_created_by := v_actor_id       -- Actor for audit
    );

    IF v_tx_id IS NULL THEN
      RAISE EXCEPTION 'Failed to create cashbox transaction';
    END IF;

    -- STEP 3: Update expense with transaction link
    UPDATE auto_expenses
    SET 
      transaction_id = v_tx_id,
      cashbox_id = p_cashbox_id
    WHERE id = v_expense_id;
  END IF;

  -- STEP 4: Update car cost_price (full amount, even if owner paid)
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
      'expense_date', p_expense_date
    )
  );

  -- STEP 6: Recalculate P&L
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

-- =====================================================
-- PART B: Add P&L recalc hook to auto_record_payment_v2
-- =====================================================

CREATE OR REPLACE FUNCTION auto_record_payment_v2(
  p_deal_id UUID,
  p_cashbox_id UUID,
  p_paid_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_description TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_actor_id UUID;
  v_deal RECORD;
  v_car_id UUID;
  v_currency TEXT;
  v_direction TEXT;
  v_tx_id UUID;
  v_payment_id UUID;
  v_new_total_paid NUMERIC;
  v_cashbox_currency TEXT;
BEGIN
  -- Set actor
  v_actor_id := COALESCE(p_actor_employee_id, '00000000-0000-0000-0000-000000000000');

  -- Validate amount
  IF p_paid_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Get deal info
  SELECT 
    d.id,
    d.car_id,
    d.deal_type,
    d.sale_price,
    d.total_amount,
    d.total_paid,
    d.currency,
    d.status
  INTO v_deal
  FROM auto_deals d
  WHERE d.id = p_deal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  v_car_id := v_deal.car_id;
  v_currency := COALESCE(v_deal.currency, 'RUB');

  -- Check cashbox exists and currency matches
  SELECT currency INTO v_cashbox_currency
  FROM cashboxes
  WHERE id = p_cashbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashbox not found: %', p_cashbox_id;
  END IF;

  IF v_cashbox_currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'Currency mismatch: cashbox=%, deal=%', v_cashbox_currency, v_currency;
  END IF;

  -- Determine direction based on deal type
  IF v_deal.deal_type IN ('CASH_SALE', 'INSTALLMENT', 'COMMISSION_SALE', 'RENT', 'RENTAL') THEN
    v_direction := 'IN';  -- Customer pays company
  ELSIF v_deal.deal_type = 'PURCHASE' THEN
    v_direction := 'OUT'; -- Company pays supplier
  ELSE
    v_direction := 'IN';  -- Default
  END IF;

  -- Create cashbox transaction
  IF v_direction = 'IN' THEN
    -- Incoming payment (positive amount)
    SELECT tx_id INTO v_tx_id
    FROM cashbox_operation_v2(
      p_cashbox_id := p_cashbox_id,
      p_amount := p_paid_amount,
      p_category := 'DEAL_PAYMENT',
      p_description := COALESCE(p_description, 'Auto deal payment'),
      p_reference_id := NULL,
      p_deal_id := p_deal_id,
      p_created_by := v_actor_id
    );
  ELSE
    -- Outgoing payment (negative amount)
    SELECT tx_id INTO v_tx_id
    FROM cashbox_operation_v2(
      p_cashbox_id := p_cashbox_id,
      p_amount := -p_paid_amount,
      p_category := 'DEAL_PAYMENT',
      p_description := COALESCE(p_description, 'Auto deal payment (outgoing)'),
      p_reference_id := NULL,
      p_deal_id := p_deal_id,
      p_created_by := v_actor_id
    );
  END IF;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create cashbox transaction';
  END IF;

  -- Insert payment record
  INSERT INTO auto_payments (
    deal_id,
    cashbox_id,
    transaction_id,
    paid_amount,
    currency,
    direction,
    payment_date,
    description,
    created_by_employee_id
  ) VALUES (
    p_deal_id,
    p_cashbox_id,
    v_tx_id,
    p_paid_amount,
    v_currency,
    v_direction,
    p_payment_date,
    p_description,
    v_actor_id
  ) RETURNING id INTO v_payment_id;

  -- Update deal total_paid
  v_new_total_paid := COALESCE(v_deal.total_paid, 0) + p_paid_amount;
  
  UPDATE auto_deals
  SET 
    total_paid = v_new_total_paid,
    status = CASE
      WHEN v_new_total_paid >= COALESCE(sale_price, total_amount, 0) 
        AND deal_type IN ('CASH_SALE', 'INSTALLMENT')
      THEN 'COMPLETED'
      ELSE status
    END
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
    'auto_payments',
    v_payment_id,
    NULL,
    jsonb_build_object(
      'deal_id', p_deal_id,
      'paid_amount', p_paid_amount,
      'currency', v_currency,
      'direction', v_direction,
      'payment_date', p_payment_date,
      'tx_id', v_tx_id
    )
  );

  -- Recalculate P&L after payment
  BEGIN
    PERFORM auto_recalc_pnl_v2(p_deal_id);
  EXCEPTION WHEN OTHERS THEN
    -- Don't break payment if P&L calc fails
    NULL;
  END;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
