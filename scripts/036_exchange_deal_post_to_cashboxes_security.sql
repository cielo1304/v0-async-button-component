-- =====================================================================
-- Migration: 036_exchange_deal_post_to_cashboxes_security.sql
-- Description: Add security checks to prevent double-posting and ensure
--              cashboxes belong to the same company as the deal
-- =====================================================================

CREATE OR REPLACE FUNCTION public.exchange_deal_post_to_cashboxes(
  p_deal_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal record;
  v_leg record;
  v_cashbox record;
  v_delta numeric;
  v_new_balance numeric;
  v_legs_with_cashbox int := 0;
BEGIN
  -- =============================================
  -- Authentication & Authorization
  -- =============================================
  
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
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
  
  -- Verify user is member of deal's company
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND company_id = v_deal.company_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of deal company %', v_deal.company_id;
  END IF;
  
  -- FIXED: Prevent double-posting
  IF v_deal.status = 'completed' THEN
    RAISE EXCEPTION 'Deal % is already completed and cannot be posted again', p_deal_id;
  END IF;
  
  IF v_deal.status = 'cancelled' THEN
    RAISE EXCEPTION 'Deal % is cancelled and cannot be posted', p_deal_id;
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
  -- Lock Cashboxes, Validate & Update
  -- =============================================
  
  FOR v_leg IN
    SELECT 
      el.*,
      cb.balance as cashbox_balance,
      cb.currency as cashbox_currency,
      cb.company_id as cashbox_company_id
    FROM exchange_legs el
    -- FIXED: Join with company_id check to prevent cross-company cashbox access
    JOIN cashboxes cb ON cb.id = el.cashbox_id 
                      AND cb.company_id = v_deal.company_id
    WHERE el.deal_id = p_deal_id
      AND el.cashbox_id IS NOT NULL
    FOR UPDATE OF cb  -- Lock cashboxes
  LOOP
    -- Verify cashbox belongs to deal company (redundant but explicit)
    IF v_leg.cashbox_company_id != v_deal.company_id THEN
      RAISE EXCEPTION 'Cashbox % does not belong to deal company %',
        v_leg.cashbox_id, v_deal.company_id;
    END IF;
    
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
    
    -- Check for negative balance (prevent overdraft)
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
  
  -- If no legs were found with valid cashboxes, raise error
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No valid cashboxes found for deal % in company %',
      p_deal_id, v_deal.company_id;
  END IF;
  
  -- =============================================
  -- Update Deal Status (now updated_at exists)
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
'Posts an exchange deal to cashboxes atomically with enhanced security.
FIXED in 036:
- Prevents double-posting (checks if deal is already completed)
- Prevents posting cancelled deals
- Verifies user is member of deal company (multi-membership support)
- Ensures all cashboxes belong to the same company as the deal
- Uses SECURITY DEFINER with explicit search_path for safety
- Updated_at column now exists (added in script 034)

Enforces:
- User authentication and membership in deal company
- Deal status must be draft (not completed or cancelled)
- All cashboxes must belong to deal company
- Currency match between cashbox and leg asset_code
- Sufficient balance check (no negative balances)
- Atomic transaction with cashbox locking
All operations complete or rollback together.';
