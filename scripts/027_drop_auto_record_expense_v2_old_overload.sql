-- =====================================================
-- Migration 027: Drop Old auto_record_expense_v2 Overload
-- =====================================================
-- Purpose: Remove the 10-parameter overload from scripts/024
--          to eliminate Supabase RPC ambiguous function error.
--          After this migration, only the 11-parameter version
--          (with p_expense_date) from scripts/026 will remain.
-- =====================================================

-- Drop the old 10-parameter signature (without p_expense_date)
-- This is the version originally created in scripts/024
DROP FUNCTION IF EXISTS auto_record_expense_v2(
  UUID,    -- p_car_id
  UUID,    -- p_deal_id
  UUID,    -- p_cashbox_id
  NUMERIC, -- p_amount
  TEXT,    -- p_currency
  TEXT,    -- p_type
  TEXT,    -- p_description
  TEXT,    -- p_paid_by
  NUMERIC, -- p_owner_share
  UUID     -- p_actor_employee_id
);

-- NOTE: The current 11-parameter version (with p_expense_date)
-- defined in scripts/026 remains active and does NOT need to be recreated.

COMMENT ON FUNCTION auto_record_expense_v2 IS 
'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc. Single function signature after migration 027.';
