-- =============================================
-- Script 028: Harden auto_record_expense_v2 Signature
-- =============================================
-- Final cleanup: drop old 10-parameter overload and comment the correct 11-parameter version
-- Closes Variant B hardening
--
-- CORRECT signature order (from PR #26):
-- auto_record_expense_v2(
--   p_car_id UUID,
--   p_deal_id UUID,
--   p_cashbox_id UUID,
--   p_amount NUMERIC,
--   p_currency TEXT,
--   p_type TEXT,
--   p_description TEXT,
--   p_paid_by TEXT,
--   p_owner_share NUMERIC,
--   p_actor_employee_id UUID,
--   p_expense_date DATE  -- 11th parameter
-- )

-- ─────────────────────────────────────────────
-- 1. Drop old 10-parameter overload WITH EXPLICIT SCHEMA AND CORRECT ORDER
-- ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
  UUID,        -- p_car_id
  UUID,        -- p_deal_id
  UUID,        -- p_cashbox_id
  NUMERIC,     -- p_amount
  TEXT,        -- p_currency
  TEXT,        -- p_type
  TEXT,        -- p_description
  TEXT,        -- p_paid_by
  NUMERIC,     -- p_owner_share
  UUID         -- p_actor_employee_id
);

-- ─────────────────────────────────────────────
-- 2. Add COMMENT with explicit signature to 11-parameter version
-- ─────────────────────────────────────────────

COMMENT ON FUNCTION public.auto_record_expense_v2(
  UUID,        -- p_car_id
  UUID,        -- p_deal_id
  UUID,        -- p_cashbox_id
  NUMERIC,     -- p_amount
  TEXT,        -- p_currency
  TEXT,        -- p_type
  TEXT,        -- p_description
  TEXT,        -- p_paid_by
  NUMERIC,     -- p_owner_share
  UUID,        -- p_actor_employee_id
  DATE         -- p_expense_date
) IS 'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc. Single signature after 027/028.';

-- ─────────────────────────────────────────────
-- 3. Verification: Count functions to ensure only 1 exists
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'auto_record_expense_v2'
    AND n.nspname = 'public';
  
  IF v_count != 1 THEN
    RAISE WARNING 'Expected exactly 1 auto_record_expense_v2 function, found %', v_count;
  ELSE
    RAISE NOTICE 'SUCCESS: auto_record_expense_v2 has exactly 1 signature (11 parameters)';
  END IF;
END $$;
