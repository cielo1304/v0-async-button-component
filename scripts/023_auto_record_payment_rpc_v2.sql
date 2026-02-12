-- =============================================
-- 023: Auto Record Payment RPC V2
-- Purpose: Atomic payment recording through cashbox_operation_v2
-- =============================================

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
  SELECT * INTO v_tx_id
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

  -- Determine sale price (use sale_price if available, otherwise total_amount)
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
    table_name,
    record_id,
    action,
    actor_id,
    old_data,
    new_data
  ) VALUES (
    'auto_deals',
    p_deal_id,
    'auto_payment',
    v_actor_id,
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
      'status', v_new_status,
      'actor', v_actor_id
    )
  );

  RETURN v_payment_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'auto_record_payment_v2 failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_record_payment_v2 IS 'Atomically record auto payment through cashbox_operation_v2 with full audit trail';
