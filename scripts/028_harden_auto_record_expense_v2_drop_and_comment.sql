-- Migration 028: Harden auto_record_expense_v2 overload drop and comment
-- Purpose: Safely drop old 10-param overload and comment the correct 11-param version
-- This ensures only ONE function signature exists to avoid Supabase RPC ambiguity

-- Drop old 10-param overload точно по схеме
DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID
);

-- Comment строго на 11-param версию
COMMENT ON FUNCTION public.auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID, DATE
) IS 'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc. Single function signature after migration 027/028.';
