# Variant B Fix #5 - Auto Payment RPC Overload & P&L Integration

**Status**: ✅ COMPLETE  
**Date**: 2026-02-13  
**Migration**: `026_fix_auto_payment_rpc_overload_and_pnl.sql`

---

## Problem Statement

1. **Payment RPC Overload Issue**: Migration 025 added a bad overload of `auto_record_payment_v2` with wrong signature that doesn't match what `app/actions/auto.ts` calls
2. **Missing P&L Recalc**: The correct payment function (from 023) doesn't trigger P&L recalculation after payments
3. **Expense Date Not Null-Safe**: `auto_record_expense_v2` doesn't handle null `p_expense_date` gracefully

---

## Solution Overview

### Migration 026: Three-Part Fix

**PART A: Remove Bad Overload**
- Drops the incorrect `auto_record_payment_v2(UUID, UUID, NUMERIC, DATE, TEXT, UUID)` signature added in 025

**PART B: Correct Payment Function + P&L**
- Replaces `auto_record_payment_v2` with the correct signature from 023:
  ```sql
  auto_record_payment_v2(
    p_deal_id UUID,
    p_cashbox_id UUID,
    p_amount NUMERIC,
    p_currency TEXT,
    p_schedule_payment_id UUID DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_actor_employee_id UUID DEFAULT NULL
  )
  ```
- Adds P&L recalculation at the end:
  ```sql
  BEGIN
    PERFORM auto_recalc_pnl_v2(p_deal_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  ```

**PART C: Null-Safe Expense Date**
- Makes `auto_record_expense_v2` handle null `p_expense_date` safely:
  ```sql
  v_safe_expense_date := COALESCE(p_expense_date, CURRENT_DATE);
  ```
- Uses `v_safe_expense_date` in INSERT and audit log

---

## Server Action Changes

### File: `app/actions/auto.ts`

**recordAutoExpenseV2**:
- Changed to conditionally add `p_expense_date` only if provided:
  ```typescript
  const rpcArgs: any = {
    p_car_id: params.carId,
    // ... other args
  }

  // Only add p_expense_date if explicitly provided
  if (params.expenseDate) {
    rpcArgs.p_expense_date = params.expenseDate
  }

  const { data: expenseId, error } = await supabase.rpc('auto_record_expense_v2', rpcArgs)
  ```
- This prevents sending `null` explicitly, letting DB use COALESCE default

---

## Database Changes

### Functions Modified

1. **auto_record_payment_v2** (Replaced)
   - **Signature**: Correct 023 signature with 7 parameters
   - **New Feature**: Automatic P&L recalculation after payment
   - **Integration**: Calls `auto_recalc_pnl_v2(p_deal_id)` in exception-safe block
   - **Behavior**: Updates `profit_total` and `profit_available` after each payment

2. **auto_record_expense_v2** (Replaced)
   - **New Feature**: Null-safe expense date handling
   - **Implementation**: `v_safe_expense_date := COALESCE(p_expense_date, CURRENT_DATE)`
   - **Impact**: Never fails if `p_expense_date` is null or not provided

---

## Testing Checklist

### Payment P&L Integration
- [x] Create deal with expenses
- [x] Record payment via `recordAutoPaymentV2`
- [x] Verify `profit_total` updates automatically
- [x] For INSTALLMENT deals, verify `profit_available` updates

### Expense Date Safety
- [x] Create expense without `expenseDate` parameter
- [x] Verify it uses `CURRENT_DATE` as default
- [x] Create expense with explicit `expenseDate`
- [x] Verify it uses provided date

### Function Signature
- [x] Verify no overload exists (only one `auto_record_payment_v2`)
- [x] Confirm signature matches `recordAutoPaymentV2` call in `auto.ts`

---

## Acceptance Criteria

✅ **Single Payment Function**: Only ONE `auto_record_payment_v2` exists with correct signature  
✅ **P&L Auto-Update**: Payment triggers `auto_recalc_pnl_v2` automatically  
✅ **Null-Safe Dates**: Expense creation never fails due to missing `expense_date`  
✅ **No Breaking Changes**: All existing payment/expense flows work unchanged

---

## Impact on System

### Payments
- **Before**: Manual P&L recalc needed after payments
- **After**: P&L updates automatically on every payment

### Expenses
- **Before**: Could fail if `expense_date` was null/missing
- **After**: Uses `CURRENT_DATE` as safe default

### UI
- No changes required - all existing components continue to work
- P&L columns in deal lists now update immediately after payments

---

## Migration Order

```
001-020: Foundation + Finance + Currency
021-024: Auto module foundation + P&L
025: Auto expense/payment P&L hooks (had issues)
026: ← THIS FIX (payment overload, P&L integration, null-safe dates)
```

---

## Related Files

**Database**:
- `/scripts/026_fix_auto_payment_rpc_overload_and_pnl.sql` (NEW)

**Actions**:
- `/app/actions/auto.ts` (MODIFIED - recordAutoExpenseV2)

**No Changes Required**:
- UI components (work unchanged)
- Types (already have P&L fields from Fix #4)

---

## Notes

1. **Why Conditional p_expense_date?**: Supabase RPC handles missing keys better than explicit nulls for DEFAULT parameters
2. **Why COALESCE in DB?**: Defense in depth - even if null gets through, DB handles it
3. **Why Exception Block?**: P&L calculation failure shouldn't break core payment/expense operations
4. **Payment Signature**: Uses 023 signature (most complete) rather than 025 experimental overload

---

**VARIANT B FIX #5 COMPLETE** ✅
Auto payments now trigger P&L recalc automatically, and expense dates are null-safe!
