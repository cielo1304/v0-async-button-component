-- =====================================================================
-- Migration: 035_exchange_deal_create_restore_validations.sql
-- Description: Restore all validations from 030 + fix company check for 
--              multi-membership + safe NULL handling for optional fields
-- =====================================================================

CREATE OR REPLACE FUNCTION public.exchange_deal_create(
  p_company_id uuid,
  p_created_by uuid,
  p_deal_date date,
  p_status text,
  p_comment text,
  p_legs jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id uuid;
  v_leg jsonb;
  v_out_count int := 0;
  v_in_count int := 0;
BEGIN
  -- =============================================
  -- Authentication & Authorization Checks
  -- =============================================
  
  -- 1. Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- 2. Verify p_created_by matches authenticated user
  IF p_created_by != auth.uid() THEN
    RAISE EXCEPTION 'p_created_by must match authenticated user. Expected: %, Got: %', 
      auth.uid(), p_created_by;
  END IF;
  
  -- 3. FIXED: Verify user is member of the specified company (multi-membership support)
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of company %', p_company_id;
  END IF;
  
  -- =============================================
  -- Business Logic Validations (from 030)
  -- =============================================
  
  -- 4. Validate status
  IF p_status NOT IN ('draft', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft, completed, or cancelled', p_status;
  END IF;
  
  -- 5. Validate legs is an array with at least 2 elements
  IF jsonb_typeof(p_legs) != 'array' THEN
    RAISE EXCEPTION 'p_legs must be a JSON array';
  END IF;
  
  IF jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'At least 2 legs required, got %', jsonb_array_length(p_legs);
  END IF;
  
  -- 6. Validate each leg and count directions
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    -- Check required fields
    IF NOT (v_leg ? 'direction' AND v_leg ? 'asset_kind' AND v_leg ? 'asset_code' AND v_leg ? 'amount') THEN
      RAISE EXCEPTION 'Each leg must have direction, asset_kind, asset_code, and amount';
    END IF;
    
    -- Validate direction
    IF (v_leg->>'direction') NOT IN ('out', 'in') THEN
      RAISE EXCEPTION 'Invalid direction: %. Must be out or in', (v_leg->>'direction');
    END IF;
    
    -- Validate asset_kind
    IF (v_leg->>'asset_kind') NOT IN ('fiat', 'crypto', 'gold', 'other') THEN
      RAISE EXCEPTION 'Invalid asset_kind: %. Must be fiat, crypto, gold, or other', 
        (v_leg->>'asset_kind');
    END IF;
    
    -- Validate amount > 0
    IF (v_leg->>'amount')::numeric <= 0 THEN
      RAISE EXCEPTION 'Amount must be > 0, got %', (v_leg->>'amount');
    END IF;
    
    -- Count directions
    IF (v_leg->>'direction') = 'out' THEN
      v_out_count := v_out_count + 1;
    ELSE
      v_in_count := v_in_count + 1;
    END IF;
  END LOOP;
  
  -- 7. Ensure at least 1 'out' and 1 'in'
  IF v_out_count < 1 THEN
    RAISE EXCEPTION 'At least 1 leg with direction=out is required';
  END IF;
  
  IF v_in_count < 1 THEN
    RAISE EXCEPTION 'At least 1 leg with direction=in is required';
  END IF;
  
  -- =============================================
  -- Create Deal & Legs
  -- =============================================
  
  -- 8. Insert deal (ensure deal_date never NULL)
  INSERT INTO exchange_deals (
    company_id,
    created_by,
    deal_date,
    status,
    comment
  ) VALUES (
    p_company_id,
    p_created_by,
    COALESCE(p_deal_date, CURRENT_DATE),
    p_status,
    p_comment
  )
  RETURNING id INTO v_deal_id;
  
  -- 9. Insert legs with safe NULL handling for optional fields
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO exchange_legs (
      company_id,
      deal_id,
      direction,
      asset_kind,
      asset_code,
      amount,
      cashbox_id,
      rate,
      fee
    ) VALUES (
      p_company_id,
      v_deal_id,
      (v_leg->>'direction')::text,
      (v_leg->>'asset_kind')::text,
      (v_leg->>'asset_code')::text,
      (v_leg->>'amount')::numeric,
      -- Safe cashbox_id cast: only convert if field exists and is not empty string
      CASE 
        WHEN v_leg ? 'cashbox_id' AND NULLIF(v_leg->>'cashbox_id', '') IS NOT NULL 
        THEN (v_leg->>'cashbox_id')::uuid 
        ELSE NULL 
      END,
      -- Safe rate cast: only convert if field exists and is not empty string
      CASE 
        WHEN v_leg ? 'rate' AND NULLIF(v_leg->>'rate', '') IS NOT NULL 
        THEN (v_leg->>'rate')::numeric 
        ELSE NULL 
      END,
      -- Safe fee cast: only convert if field exists and is not empty string
      CASE 
        WHEN v_leg ? 'fee' AND NULLIF(v_leg->>'fee', '') IS NOT NULL 
        THEN (v_leg->>'fee')::numeric 
        ELSE NULL 
      END
    );
  END LOOP;
  
  RETURN v_deal_id;
END;
$$;

-- =============================================
-- Comments
-- =============================================

COMMENT ON FUNCTION public.exchange_deal_create IS 
'Creates an exchange deal with multiple legs atomically.
FIXED in 035:
- Restored all validations from script 030 (status, asset_kind, amount > 0, etc.)
- Fixed company membership check to support multi-membership
- Safe NULL handling for optional fields (cashbox_id, rate, fee)
- Ensures deal_date never NULL (uses COALESCE with CURRENT_DATE)
- Uses SECURITY DEFINER with explicit search_path for safety

Enforces:
- User authentication and membership in specified company
- Valid status (draft/completed/cancelled)
- Valid directions (out/in) and asset_kinds (fiat/crypto/gold/other)
- Amount > 0 for all legs
- Minimum 2 legs with at least 1 OUT and 1 IN';
