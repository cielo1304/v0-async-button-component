-- =============================================
-- Migration: 032_exchange_deal_create_enforce_auth.sql
-- Description: Enforce authentication and tenant isolation in exchange_deal_create RPC
-- =============================================

CREATE OR REPLACE FUNCTION public.exchange_deal_create(
  p_company_id uuid,
  p_created_by uuid,
  p_deal_date date,
  p_status text,
  p_comment text,
  p_legs jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal_id uuid;
  v_leg jsonb;
  v_out_count int := 0;
  v_in_count int := 0;
  v_user_company_id uuid;
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
    RAISE EXCEPTION 'p_created_by must match authenticated user. Expected: %, Got: %', auth.uid(), p_created_by;
  END IF;
  
  -- 3. Verify p_company_id belongs to authenticated user
  SELECT company_id INTO v_user_company_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  IF v_user_company_id IS NULL THEN
    RAISE EXCEPTION 'User is not a member of any company';
  END IF;
  
  IF p_company_id != v_user_company_id THEN
    RAISE EXCEPTION 'p_company_id must match user company. Expected: %, Got: %', v_user_company_id, p_company_id;
  END IF;
  
  -- =============================================
  -- Business Logic Validations
  -- =============================================
  
  -- 4. Validate minimum legs count
  IF jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'Exchange deal must have at least 2 legs (minimum 1 OUT + 1 IN)';
  END IF;
  
  -- 5. Count direction types
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    IF (v_leg->>'direction') = 'out' THEN
      v_out_count := v_out_count + 1;
    ELSIF (v_leg->>'direction') = 'in' THEN
      v_in_count := v_in_count + 1;
    ELSE
      RAISE EXCEPTION 'Invalid direction: %. Must be "out" or "in"', (v_leg->>'direction');
    END IF;
  END LOOP;
  
  -- 6. Validate direction requirements
  IF v_out_count = 0 THEN
    RAISE EXCEPTION 'Exchange deal must have at least 1 OUT leg. Found: 0';
  END IF;
  
  IF v_in_count = 0 THEN
    RAISE EXCEPTION 'Exchange deal must have at least 1 IN leg. Found: 0';
  END IF;
  
  -- =============================================
  -- Create Deal & Legs
  -- =============================================
  
  -- 7. Insert deal
  INSERT INTO exchange_deals (
    company_id,
    created_by,
    deal_date,
    status,
    comment
  ) VALUES (
    p_company_id,
    p_created_by,
    p_deal_date,
    p_status,
    p_comment
  )
  RETURNING id INTO v_deal_id;
  
  -- 8. Insert legs
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO exchange_legs (
      deal_id,
      company_id,
      direction,
      asset_kind,
      asset_code,
      amount,
      cashbox_id,
      rate,
      fee
    ) VALUES (
      v_deal_id,
      p_company_id,
      (v_leg->>'direction')::text,
      (v_leg->>'asset_kind')::text,
      (v_leg->>'asset_code')::text,
      (v_leg->>'amount')::numeric,
      (v_leg->>'cashbox_id')::uuid,
      (v_leg->>'rate')::numeric,
      (v_leg->>'fee')::numeric
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
Enforces authentication, tenant isolation, and business rules:
- User must be authenticated
- p_created_by must match auth.uid()
- p_company_id must belong to user
- Minimum 2 legs required
- At least 1 OUT and 1 IN leg required';
