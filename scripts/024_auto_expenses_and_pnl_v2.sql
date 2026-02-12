-- =====================================================
-- Migration 024: Auto Expenses + P&L (profit_total/profit_available) + cashbox_operation_v2 integration
-- =====================================================

-- 1) CREATE auto_expenses TABLE
CREATE TABLE IF NOT EXISTS auto_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  deal_id UUID NULL REFERENCES auto_deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  description TEXT,
  paid_by TEXT NOT NULL DEFAULT 'COMPANY' CHECK (paid_by IN ('COMPANY', 'OWNER', 'SHARED')),
  owner_share NUMERIC(15, 2) NOT NULL DEFAULT 0,
  cashbox_id UUID NULL REFERENCES cashboxes(id) ON DELETE SET NULL,
  transaction_id UUID NULL REFERENCES transactions(id) ON DELETE SET NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by_employee_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for auto_expenses
CREATE INDEX IF NOT EXISTS idx_auto_expenses_car_id_date ON auto_expenses(car_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_auto_expenses_deal_id ON auto_expenses(deal_id);
CREATE INDEX IF NOT EXISTS idx_auto_expenses_transaction_id ON auto_expenses(transaction_id);
CREATE INDEX IF NOT EXISTS idx_auto_expenses_cashbox_id ON auto_expenses(cashbox_id);

-- 2) ADD profit_total and profit_available columns to auto_deals if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auto_deals' AND column_name='profit_total') THEN
    ALTER TABLE auto_deals ADD COLUMN profit_total NUMERIC(15, 2) NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auto_deals' AND column_name='profit_available') THEN
    ALTER TABLE auto_deals ADD COLUMN profit_available NUMERIC(15, 2) NULL;
  END IF;
END $$;

-- 3) CREATE FUNCTION: auto_recalc_pnl_v2
-- Recalculates profit_total and profit_available for a deal
DROP FUNCTION IF EXISTS auto_recalc_pnl_v2(UUID);

CREATE OR REPLACE FUNCTION auto_recalc_pnl_v2(p_deal_id UUID)
RETURNS VOID AS $$
DECLARE
  v_deal RECORD;
  v_car_cost NUMERIC;
  v_sale NUMERIC;
  v_paid NUMERIC;
  v_expenses NUMERIC;
  v_commission NUMERIC;
  v_profit_total NUMERIC;
  v_profit_available NUMERIC;
BEGIN
  -- Get deal details
  SELECT 
    d.id,
    d.car_id,
    d.deal_type,
    d.sale_price,
    d.total_amount,
    d.total_paid,
    d.paid_amount,
    d.commission_amount,
    d.commission_fixed_amount
  INTO v_deal
  FROM auto_deals d
  WHERE d.id = p_deal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  -- Get car cost
  SELECT COALESCE(c.cost_price, c.purchase_price, 0)
  INTO v_car_cost
  FROM cars c
  WHERE c.id = v_deal.car_id;

  -- Calculate sale amount
  v_sale := COALESCE(v_deal.sale_price, v_deal.total_amount, 0);

  -- Calculate paid amount (from auto_payments or fallback to deal fields)
  SELECT COALESCE(SUM(paid_amount), 0)
  INTO v_paid
  FROM auto_payments
  WHERE deal_id = p_deal_id AND direction = 'IN';
  
  IF v_paid = 0 THEN
    v_paid := COALESCE(v_deal.total_paid, v_deal.paid_amount, 0);
  END IF;

  -- Calculate total expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_expenses
  FROM auto_expenses
  WHERE deal_id = p_deal_id;

  -- Calculate commission for COMMISSION_SALE
  IF v_deal.deal_type = 'COMMISSION_SALE' THEN
    v_commission := COALESCE(v_deal.commission_amount, v_deal.commission_fixed_amount, 0);
  ELSE
    v_commission := 0;
  END IF;

  -- Calculate profit_total based on deal type
  IF v_deal.deal_type = 'COMMISSION_SALE' THEN
    v_profit_total := v_commission - v_expenses;
  ELSIF v_deal.deal_type IN ('CASH_SALE', 'INSTALLMENT') THEN
    v_profit_total := v_sale - v_car_cost - v_expenses;
  ELSIF v_deal.deal_type IN ('RENT', 'RENTAL') THEN
    v_profit_total := v_paid - v_expenses;
  ELSE
    v_profit_total := 0 - v_expenses;
  END IF;

  -- Calculate profit_available
  IF v_deal.deal_type = 'INSTALLMENT' AND v_sale > 0 THEN
    v_profit_available := v_profit_total * LEAST(1.0, v_paid / v_sale);
  ELSE
    v_profit_available := v_profit_total;
  END IF;

  -- Update deal
  UPDATE auto_deals
  SET
    profit_total = v_profit_total,
    profit_available = v_profit_available
  WHERE id = p_deal_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) CREATE RPC: auto_record_expense_v2
-- Records an expense with cashbox integration
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
  p_actor_employee_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_actor_id UUID;
  v_company_part NUMERIC;
  v_tx_id UUID;
  v_new_expense_id UUID;
  v_cashbox_currency TEXT;
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

  -- If company pays, validate and deduct from cashbox
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

    -- Call cashbox_operation_v2 to deduct funds (negative amount for expense)
    -- Use minimal parameters: cashbox_id, amount, category, description, reference_id
    SELECT tx_id INTO v_tx_id
    FROM cashbox_operation_v2(
      p_cashbox_id,
      -v_company_part,
      'EXPENSE',
      COALESCE(p_description, 'Auto expense: ' || p_type),
      p_deal_id  -- reference_id to link to deal
    );

    IF v_tx_id IS NULL THEN
      RAISE EXCEPTION 'Failed to create cashbox transaction';
    END IF;
  ELSE
    v_tx_id := NULL;
  END IF;

  -- Insert expense record
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
    p_cashbox_id,
    v_tx_id,
    v_actor_id,
    CURRENT_DATE
  ) RETURNING id INTO v_new_expense_id;

  -- Update car cost_price (full amount, even if owner paid)
  UPDATE cars
  SET cost_price = COALESCE(cost_price, 0) + p_amount
  WHERE id = p_car_id;

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
    'auto_expense',
    'auto',
    'auto_expenses',
    v_new_expense_id,
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
      'tx_id', v_tx_id
    )
  );

  -- Recalculate P&L if deal is specified
  IF p_deal_id IS NOT NULL THEN
    PERFORM auto_recalc_pnl_v2(p_deal_id);
  END IF;

  RETURN v_new_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
