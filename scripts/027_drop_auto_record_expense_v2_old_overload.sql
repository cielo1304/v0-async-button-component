-- =====================================================
-- Migration 027: Drop Old auto_record_expense_v2 Overload
-- =====================================================
-- Purpose: Remove the 10-parameter overload to eliminate 
--          Supabase RPC ambiguous function error.
--          After this migration, only the 11-parameter version
--          (with p_expense_date) will remain.
--
-- CORRECT signature order (from PR #26):
-- auto_record_expense_v2(
--   p_car_id UUID,
--   p_deal_id UUID = NULL,
--   p_cashbox_id UUID = NULL,
--   p_amount NUMERIC,
--   p_currency TEXT,
--   p_type TEXT,
--   p_description TEXT = NULL,
--   p_paid_by TEXT = 'COMPANY',
--   p_owner_share NUMERIC = 0,
--   p_actor_employee_id UUID = NULL,
--   p_expense_date DATE = NULL  -- 11th parameter
-- )
-- =====================================================

-- Drop the old 10-parameter signature (without p_expense_date)
-- Must use explicit schema to avoid ambiguity
DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
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

-- NOTE: The 11-parameter version (with p_expense_date) remains active
