-- =============================================
-- Script 028: Harden auto_record_expense_v2 Signature
-- =============================================
-- Final cleanup: drop old 10-parameter overload and comment the correct 11-parameter version
-- Closes Variant B hardening

-- ─────────────────────────────────────────────
-- 1. Drop old 10-parameter overload WITH EXPLICIT SCHEMA
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
  UUID,        -- p_deal_id
  UUID,        -- p_car_id
  UUID,        -- p_category_id
  NUMERIC,     -- p_amount
  TEXT,        -- p_currency
  TEXT,        -- p_note
  TEXT,        -- p_payment_method
  TEXT,        -- p_recipient
  NUMERIC,     -- p_rate_to_usd
  UUID         -- p_created_by
);

-- ─────────────────────────────────────────────
-- 2. Add COMMENT with explicit signature to 11-parameter version
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.auto_record_expense_v2(
  UUID,        -- p_deal_id
  UUID,        -- p_car_id
  UUID,        -- p_category_id
  NUMERIC,     -- p_amount
  TEXT,        -- p_currency
  TEXT,        -- p_note
  TEXT,        -- p_payment_method
  TEXT,        -- p_recipient
  NUMERIC,     -- p_rate_to_usd
  UUID,        -- p_created_by
  DATE         -- p_expense_date
) IS 'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc. Single signature after 027/028.';

-- ─────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────

-- Verify only one auto_record_expense_v2 exists
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'auto_record_expense_v2'
    AND pronamespace = 'public'::regnamespace;
  
  IF v_count != 1 THEN
    RAISE WARNING 'Expected exactly 1 auto_record_expense_v2 function, found %', v_count;
  ELSE
    RAISE NOTICE 'SUCCESS: auto_record_expense_v2 has exactly 1 signature (11 parameters)';
  END IF;
END $$;
