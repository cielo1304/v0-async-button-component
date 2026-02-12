-- =============================================
-- Auto Ledger & Atomic RPC Functions (Variant B)
-- =============================================
-- This migration creates:
-- 1. auto_ledger table for tracking all financial operations on cars
-- 2. Atomic RPC functions for auto deals and payments with P&L calculation
-- 3. View for simplified P&L reporting per car

-- =============================================
-- STEP 1: Create auto_ledger table
-- =============================================

CREATE TABLE IF NOT EXISTS auto_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES auto_deals(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount <> 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL
);

-- Add category constraint
ALTER TABLE auto_ledger DROP CONSTRAINT IF EXISTS auto_ledger_category_check;
ALTER TABLE auto_ledger ADD CONSTRAINT auto_ledger_category_check 
  CHECK (category IN ('PURCHASE', 'EXPENSE', 'SALE_REVENUE', 'SALE_PAYMENT'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auto_ledger_car_id ON auto_ledger(car_id);
CREATE INDEX IF NOT EXISTS idx_auto_ledger_deal_id ON auto_ledger(deal_id);
CREATE INDEX IF NOT EXISTS idx_auto_ledger_category ON auto_ledger(category);
CREATE INDEX IF NOT EXISTS idx_auto_ledger_created_at ON auto_ledger(created_at DESC);

-- RLS policies
ALTER TABLE auto_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on auto_ledger for authenticated users"
  ON auto_ledger FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- STEP 2: Create P&L View for Cars
-- =============================================

CREATE OR REPLACE VIEW auto_car_profit_loss AS
SELECT 
  car_id,
  -- Purchase cost (negative amount in ledger = expense)
  COALESCE(SUM(amount) FILTER (WHERE category = 'PURCHASE'), 0) AS purchase_cost,
  -- Total expenses (negative amounts)
  COALESCE(SUM(amount) FILTER (WHERE category = 'EXPENSE'), 0) AS total_expenses,
  -- Sale revenue (positive amount)
  COALESCE(SUM(amount) FILTER (WHERE category = 'SALE_REVENUE'), 0) AS sale_revenue,
  -- Payments received (positive amounts)
  COALESCE(SUM(amount) FILTER (WHERE category = 'SALE_PAYMENT'), 0) AS total_payments,
  -- P&L calculation
  COALESCE(SUM(amount) FILTER (WHERE category IN ('SALE_REVENUE', 'SALE_PAYMENT')), 0) 
    + COALESCE(SUM(amount) FILTER (WHERE category IN ('PURCHASE', 'EXPENSE')), 0) AS profit_loss
FROM auto_ledger
GROUP BY car_id;

-- =============================================
-- STEP 3: Atomic RPC for Creating Auto Deal
-- =============================================

CREATE OR REPLACE FUNCTION auto_create_deal_v1(
  p_car_id UUID,
  p_buyer_id UUID,
  p_deal_type TEXT, -- 'CASH_SALE', 'COMMISSION_SALE', etc.
  p_total_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_new_deal_id UUID;
  v_actor_id UUID;
  v_car_status TEXT;
  v_ledger_category TEXT;
  v_ledger_amount NUMERIC;
  v_deal_number TEXT;
  v_max_number INT;
BEGIN
  -- Validate deal type
  IF p_deal_type NOT IN ('CASH_SALE', 'COMMISSION_SALE', 'INSTALLMENT', 'RENTAL') THEN
    RAISE EXCEPTION 'Invalid deal_type. Must be CASH_SALE, COMMISSION_SALE, INSTALLMENT, or RENTAL.';
  END IF;

  -- Validate amount
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Total amount must be positive';
  END IF;

  -- Determine actor
  IF p_actor_employee_id IS NOT NULL THEN
    v_actor_id := p_actor_employee_id;
  ELSE
    v_actor_id := auth.uid();
  END IF;

  -- Check car exists
  SELECT status INTO v_car_status FROM cars WHERE id = p_car_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Car not found';
  END IF;

  -- Generate deal_number
  SELECT COALESCE(MAX(CAST(SUBSTRING(deal_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_max_number
  FROM auto_deals;
  v_deal_number := 'DEAL-' || LPAD(v_max_number::TEXT, 6, '0');

  -- Create auto deal
  INSERT INTO auto_deals (
    deal_number,
    car_id,
    buyer_id,
    deal_type,
    total_amount,
    paid_amount,
    status,
    created_by
  ) VALUES (
    v_deal_number,
    p_car_id,
    p_buyer_id,
    p_deal_type,
    p_total_amount,
    0, -- paid_amount starts at 0
    'ACTIVE',
    v_actor_id
  )
  RETURNING id INTO v_new_deal_id;

  -- Create auto_ledger entry for SALE
  v_ledger_category := 'SALE_REVENUE';
  v_ledger_amount := p_total_amount; -- Sale is revenue (positive)

  INSERT INTO auto_ledger (
    car_id,
    deal_id,
    category,
    amount,
    description,
    created_by
  ) VALUES (
    p_car_id,
    v_new_deal_id,
    v_ledger_category,
    v_ledger_amount,
    COALESCE(p_description, p_deal_type || ' deal created'),
    v_actor_id
  );

  -- Update car status to SOLD
  UPDATE cars SET status = 'SOLD' WHERE id = p_car_id;

  -- Create audit log
  INSERT INTO audit_log_v2 (
    table_name,
    record_id,
    action,
    actor_id,
    new_data
  ) VALUES (
    'auto_deals',
    v_new_deal_id,
    'INSERT',
    v_actor_id,
    jsonb_build_object(
      'deal_number', v_deal_number,
      'car_id', p_car_id,
      'buyer_id', p_buyer_id,
      'deal_type', p_deal_type,
      'total_amount', p_total_amount,
      'status', 'ACTIVE'
    )
  );

  RETURN json_build_object(
    'success', true,
    'deal_id', v_new_deal_id,
    'deal_number', v_deal_number,
    'ledger_amount', v_ledger_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 3B: Atomic RPC for Creating Purchase Deal
-- =============================================

CREATE OR REPLACE FUNCTION auto_create_purchase_v1(
  p_car_id UUID,
  p_supplier_name TEXT,
  p_purchase_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  -- Validate amount
  IF p_purchase_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  -- Determine actor
  IF p_actor_employee_id IS NOT NULL THEN
    v_actor_id := p_actor_employee_id;
  ELSE
    v_actor_id := auth.uid();
  END IF;

  -- Check car exists
  IF NOT EXISTS (SELECT 1 FROM cars WHERE id = p_car_id) THEN
    RAISE EXCEPTION 'Car not found';
  END IF;

  -- Create ledger entry for PURCHASE (expense is negative)
  INSERT INTO auto_ledger (
    car_id,
    deal_id,
    category,
    amount,
    description,
    created_by
  ) VALUES (
    p_car_id,
    NULL,
    'PURCHASE',
    -p_purchase_amount, -- Purchase is expense (negative)
    COALESCE(p_description, 'Purchase from ' || p_supplier_name),
    v_actor_id
  );

  -- Update car status to IN_STOCK
  UPDATE cars SET status = 'IN_STOCK' WHERE id = p_car_id;

  -- Create audit log
  INSERT INTO audit_log_v2 (
    table_name,
    record_id,
    action,
    actor_id,
    new_data
  ) VALUES (
    'auto_ledger',
    p_car_id,
    'INSERT',
    v_actor_id,
    jsonb_build_object(
      'car_id', p_car_id,
      'category', 'PURCHASE',
      'amount', p_purchase_amount,
      'supplier', p_supplier_name
    )
  );

  RETURN json_build_object(
    'success', true,
    'amount', p_purchase_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 4: Atomic RPC for Recording Auto Payment
-- =============================================

CREATE OR REPLACE FUNCTION auto_record_payment_v1(
  p_deal_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_actor_id UUID;
  v_car_id UUID;
  v_deal_type TEXT;
  v_total_amount NUMERIC;
  v_current_paid NUMERIC;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Determine actor
  IF p_actor_employee_id IS NOT NULL THEN
    v_actor_id := p_actor_employee_id;
  ELSE
    v_actor_id := auth.uid();
  END IF;

  -- Get deal details
  SELECT car_id, deal_type, total_amount, paid_amount
  INTO v_car_id, v_deal_type, v_total_amount, v_current_paid
  FROM auto_deals
  WHERE id = p_deal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Calculate new paid amount
  v_new_paid_amount := v_current_paid + p_amount;

  -- Check for overpayment
  IF v_new_paid_amount > v_total_amount THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance. Remaining: %', (v_total_amount - v_current_paid);
  END IF;

  -- Determine new status
  IF v_new_paid_amount >= v_total_amount THEN
    v_new_status := 'COMPLETED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  -- Update auto_deals
  UPDATE auto_deals
  SET 
    paid_amount = v_new_paid_amount,
    status = v_new_status
  WHERE id = p_deal_id;

  -- Create ledger entry for payment
  -- For PURCHASE deals: payment is expense (negative)
  -- For SALE deals: payment is income (positive)
  INSERT INTO auto_ledger (
    car_id,
    deal_id,
    category,
    amount,
    description,
    created_by
  ) VALUES (
    v_car_id,
    p_deal_id,
    'SALE_PAYMENT',
    p_amount, -- Payment is always tracked as positive, logic determines P&L impact
    COALESCE(p_description, 'Payment recorded'),
    v_actor_id
  );

  -- Create audit log
  INSERT INTO audit_log_v2 (
    table_name,
    record_id,
    action,
    actor_id,
    new_data
  ) VALUES (
    'auto_deals',
    p_deal_id,
    'UPDATE',
    v_actor_id,
    jsonb_build_object(
      'paid_amount', v_new_paid_amount,
      'status', v_new_status,
      'payment', p_amount
    )
  );

  RETURN json_build_object(
    'success', true,
    'new_paid_amount', v_new_paid_amount,
    'new_status', v_new_status,
    'remaining', v_total_amount - v_new_paid_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 5: Atomic RPC for Recording Auto Expense
-- =============================================

CREATE OR REPLACE FUNCTION auto_record_expense_v1(
  p_car_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be positive';
  END IF;

  -- Determine actor
  IF p_actor_employee_id IS NOT NULL THEN
    v_actor_id := p_actor_employee_id;
  ELSE
    v_actor_id := auth.uid();
  END IF;

  -- Check car exists
  IF NOT EXISTS (SELECT 1 FROM cars WHERE id = p_car_id) THEN
    RAISE EXCEPTION 'Car not found';
  END IF;

  -- Create ledger entry (expense is negative)
  INSERT INTO auto_ledger (
    car_id,
    deal_id,
    category,
    amount,
    description,
    created_by
  ) VALUES (
    p_car_id,
    NULL,
    'EXPENSE',
    -p_amount, -- Expenses are negative in ledger
    COALESCE(p_description, 'Expense recorded'),
    v_actor_id
  );

  -- Create audit log
  INSERT INTO audit_log_v2 (
    table_name,
    record_id,
    action,
    actor_id,
    new_data
  ) VALUES (
    'auto_ledger',
    p_car_id,
    'INSERT',
    v_actor_id,
    jsonb_build_object(
      'car_id', p_car_id,
      'category', 'EXPENSE',
      'amount', p_amount
    )
  );

  RETURN json_build_object(
    'success', true,
    'amount', p_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Comments
-- =============================================

COMMENT ON TABLE auto_ledger IS 'Financial ledger for all car-related transactions';
COMMENT ON VIEW auto_car_profit_loss IS 'Aggregated P&L view per car';
COMMENT ON FUNCTION auto_create_deal_v1 IS 'Atomically creates auto deal and ledger entry';
COMMENT ON FUNCTION auto_record_payment_v1 IS 'Atomically records payment for auto deal';
COMMENT ON FUNCTION auto_record_expense_v1 IS 'Atomically records expense for car';
