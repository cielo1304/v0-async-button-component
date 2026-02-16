-- =============================================
-- Migration: 033_exchange_deal_post_to_cashboxes.sql
-- Description: Atomic posting of exchange deals to cashboxes with full validation
-- =============================================

CREATE OR REPLACE FUNCTION public.exchange_deal_post_to_cashboxes(
  p_deal_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal record;
  v_leg record;
  v_cashbox record;
  v_delta numeric;
  v_new_balance numeric;
  v_legs_with_cashbox int := 0;
  v_user_company_id uuid;
BEGIN
  -- =============================================
  -- Authentication & Authorization
  -- =============================================
  
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Get user's company_id
  SELECT company_id INTO v_user_company_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  IF v_user_company_id IS NULL THEN
    RAISE EXCEPTION 'User is not a member of any company';
  END IF;
  
  -- =============================================
  -- Get Deal & Verify Ownership
  -- =============================================
  
  SELECT * INTO v_deal
  FROM exchange_deals
  WHERE id = p_deal_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exchange deal not found: %', p_deal_id;
  END IF;
  
  IF v_deal.company_id != v_user_company_id THEN
    RAISE EXCEPTION 'Deal does not belong to user company';
  END IF;
  
  -- =============================================
  -- Validate Legs with Cashboxes Exist
  -- =============================================
  
  SELECT COUNT(*) INTO v_legs_with_cashbox
  FROM exchange_legs
  WHERE deal_id = p_deal_id
    AND cashbox_id IS NOT NULL;
  
  IF v_legs_with_cashbox = 0 THEN
    RAISE EXCEPTION 'No legs with cashbox_id found for deal %', p_deal_id;
  END IF;
  
  -- =============================================
  -- Lock Cashboxes & Validate
  -- =============================================
  
  FOR v_leg IN
    SELECT el.*, cb.balance as cashbox_balance, cb.currency as cashbox_currency
    FROM exchange_legs el
    JOIN cashboxes cb ON cb.id = el.cashbox_id
    WHERE el.deal_id = p_deal_id
      AND el.cashbox_id IS NOT NULL
    FOR UPDATE OF cb  -- Lock cashboxes
  LOOP
    -- Verify cashbox currency matches asset_code
    IF v_leg.cashbox_currency != v_leg.asset_code THEN
      RAISE EXCEPTION 'Cashbox % currency (%) does not match leg asset_code (%)',
        v_leg.cashbox_id, v_leg.cashbox_currency, v_leg.asset_code;
    END IF;
    
    -- Calculate delta
    IF v_leg.direction = 'out' THEN
      v_delta := -v_leg.amount;
    ELSIF v_leg.direction = 'in' THEN
      v_delta := v_leg.amount;
    ELSE
      RAISE EXCEPTION 'Invalid direction: %', v_leg.direction;
    END IF;
    
    -- Calculate new balance
    v_new_balance := v_leg.cashbox_balance + v_delta;
    
    -- Check for negative balance
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient balance in cashbox %. Current: %, Required: %, Would result in: %',
        v_leg.cashbox_id, v_leg.cashbox_balance, ABS(v_delta), v_new_balance;
    END IF;
    
    -- Update cashbox balance
    UPDATE cashboxes
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = v_leg.cashbox_id;
    
    -- Insert transaction record
    INSERT INTO transactions (
      cashbox_id,
      amount,
      balance_after,
      category,
      description,
      reference_id,
      created_by,
      company_id,
      created_at
    ) VALUES (
      v_leg.cashbox_id,
      v_delta,
      v_new_balance,
      CASE 
        WHEN v_leg.direction = 'out' THEN 'EXCHANGE_OUT'
        WHEN v_leg.direction = 'in' THEN 'EXCHANGE_IN'
      END,
      'Exchange deal ' || p_deal_id::text,
      p_deal_id,
      auth.uid(),
      v_deal.company_id,
      now()
    );
  END LOOP;
  
  -- =============================================
  -- Update Deal Status
  -- =============================================
  
  UPDATE exchange_deals
  SET status = 'completed',
      updated_at = now()
  WHERE id = p_deal_id;
  
END;
$$;

-- =============================================
-- Comments
-- =============================================

COMMENT ON FUNCTION public.exchange_deal_post_to_cashboxes IS 
'Posts an exchange deal to cashboxes atomically with full validation:
- Verifies user authentication and deal ownership
- Locks all involved cashboxes
- Validates currency matches between cashbox and leg
- Checks for sufficient balance (no negative balances allowed)
- Updates cashbox balances
- Creates transaction records with EXCHANGE_OUT/EXCHANGE_IN categories
- Updates deal status to completed
All operations are atomic within a single transaction.';
