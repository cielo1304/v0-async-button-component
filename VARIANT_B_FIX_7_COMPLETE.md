# Variant B Fix #7: Remove auto_record_expense_v2 Overload

## Problem
After migrations 024 and 026, there were TWO overloaded versions of `auto_record_expense_v2`:
- **Old version** (024): 10 parameters, no `p_expense_date`
- **New version** (026): 11 parameters, with `p_expense_date` (defaults to `CURRENT_DATE`)

This caused Supabase RPC ambiguous function errors when calling `recordAutoExpenseV2` from the frontend without explicitly passing `expenseDate`.

## Solution
Created migration **027** to drop the old 10-parameter overload, leaving only the 11-parameter version with `p_expense_date`.

## Changes Made

### 1. New Migration: `scripts/027_drop_auto_record_expense_v2_old_overload.sql`
\`\`\`sql
-- Drop the old 10-parameter signature (without p_expense_date)
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
\`\`\`

### 2. Result After Migration 027
- **Single function signature**: Only the 11-parameter version from migration 026 remains
- **No ambiguity**: Supabase RPC can resolve the function call unambiguously
- **Backwards compatible**: The 11-parameter version has `p_expense_date` with `DEFAULT NULL`, so calling without it still works

## Acceptance Criteria

✅ **Migration 024** remains as historical record but its function overload is removed  
✅ **Migration 026** defines the active function with `p_expense_date`  
✅ **Migration 027** removes the old overload  
✅ **Frontend code** (`recordAutoExpenseV2` in `app/actions/auto.ts`) works without `expenseDate` parameter  
✅ **No ambiguous function** error from Supabase RPC

## Function Signature After Fix (CORRECTED in migrations 027/028)

\`\`\`sql
-- CORRECT parameter order from PR #26:
public.auto_record_expense_v2(
  p_car_id UUID,
  p_deal_id UUID = NULL,
  p_cashbox_id UUID = NULL,
  p_amount NUMERIC,
  p_currency TEXT,
  p_type TEXT,
  p_description TEXT = NULL,
  p_paid_by TEXT = 'COMPANY',
  p_owner_share NUMERIC = 0,
  p_actor_employee_id UUID = NULL,
  p_expense_date DATE = NULL  -- ← 11th parameter, defaults to CURRENT_DATE inside function
)
\`\`\`

**Note**: Migrations 027 and 028 were updated to use the CORRECT parameter order. The 10-parameter DROP and 11-parameter COMMENT now match this exact signature.

## Testing
1. Call `recordAutoExpenseV2` without `expenseDate` → Should use `CURRENT_DATE`
2. Call `recordAutoExpenseV2` with explicit `expenseDate` → Should use provided date
3. No ambiguous function errors in Supabase logs

---

**Status**: ✅ Complete  
**Migration File**: `/scripts/027_drop_auto_record_expense_v2_old_overload.sql`  
**Dependencies**: Requires migrations 001-026 to be executed first
