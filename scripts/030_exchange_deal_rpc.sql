-- Migration 030: Exchange Deal RPC (Variant C - Fix #2)
-- Atomic creation of exchange_deals + exchange_legs via RPC

CREATE OR REPLACE FUNCTION public.exchange_deal_create(
  p_company_id UUID,
  p_created_by UUID,
  p_deal_date DATE,
  p_status TEXT,
  p_comment TEXT,
  p_legs JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id UUID;
  v_leg JSONB;
  v_out_count INT := 0;
  v_in_count INT := 0;
  v_legs_array JSONB[];
BEGIN
  -- Validate status
  IF p_status NOT IN ('draft', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft, completed, or cancelled', p_status;
  END IF;

  -- Validate legs is an array with at least 2 elements
  IF jsonb_typeof(p_legs) != 'array' THEN
    RAISE EXCEPTION 'p_legs must be a JSON array';
  END IF;

  IF jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'At least 2 legs required, got %', jsonb_array_length(p_legs);
  END IF;

  -- Validate each leg and count directions
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
      RAISE EXCEPTION 'Invalid asset_kind: %. Must be fiat, crypto, gold, or other', (v_leg->>'asset_kind');
    END IF;

    -- Validate amount > 0
    IF (v_leg->>'amount')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'Amount must be > 0, got %', (v_leg->>'amount');
    END IF;

    -- Count directions
    IF (v_leg->>'direction') = 'out' THEN
      v_out_count := v_out_count + 1;
    ELSE
      v_in_count := v_in_count + 1;
    END IF;
  END LOOP;

  -- Ensure at least 1 'out' and 1 'in'
  IF v_out_count < 1 THEN
    RAISE EXCEPTION 'At least 1 leg with direction=out is required';
  END IF;

  IF v_in_count < 1 THEN
    RAISE EXCEPTION 'At least 1 leg with direction=in is required';
  END IF;

  -- Insert deal
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

  -- Insert legs
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
      (v_leg->>'direction')::TEXT,
      (v_leg->>'asset_kind')::TEXT,
      (v_leg->>'asset_code')::TEXT,
      (v_leg->>'amount')::NUMERIC,
      CASE WHEN v_leg ? 'cashbox_id' AND (v_leg->>'cashbox_id') IS NOT NULL 
           THEN (v_leg->>'cashbox_id')::UUID 
           ELSE NULL 
      END,
      CASE WHEN v_leg ? 'rate' AND (v_leg->>'rate') IS NOT NULL 
           THEN (v_leg->>'rate')::NUMERIC 
           ELSE NULL 
      END,
      CASE WHEN v_leg ? 'fee' AND (v_leg->>'fee') IS NOT NULL 
           THEN (v_leg->>'fee')::NUMERIC 
           ELSE NULL 
      END
    );
  END LOOP;

  RETURN v_deal_id;
END;
$$;

COMMENT ON FUNCTION public.exchange_deal_create IS 
'Atomically create exchange deal with legs. Validates status, directions, and ensures at least 1 out + 1 in leg.';
