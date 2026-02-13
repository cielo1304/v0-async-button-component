# Variant B Fix #6 - Auto Expense Clean DB Compatibility

**Status**: ✅ COMPLETE  
**Migration**: 026 (PART C fixed)  
**Date**: 2025-02-13

## Problem

Migration 026 PART C had a broken `auto_record_expense_v2` function that:
- Referenced non-existent `auto_cars` table (should be `cars`)
- Tried to insert `company_part`/`owner_part` columns that don't exist in `auto_expenses`
- Used wrong category `AUTO_EXPENSE` (should be `EXPENSE`)
- Wouldn't work on clean database installations

## Solution

Fixed scripts/026 PART C with correct architecture:

### 1. Function Signature (Unchanged)
```sql
auto_record_expense_v2(
  p_car_id UUID,
  p_deal_id UUID DEFAULT NULL,
  p_cashbox_id UUID DEFAULT NULL,
  p_amount NUMERIC,
  p_currency TEXT,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_paid_by TEXT DEFAULT 'COMPANY',
  p_owner_share NUMERIC DEFAULT 0,
  p_actor_employee_id UUID DEFAULT NULL,
  p_expense_date DATE DEFAULT NULL
)
RETURNS UUID
```

### 2. Key Changes

**✅ Drop Function Overload**
```sql
DROP FUNCTION IF EXISTS auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID, DATE
);
```

**✅ Validate Car in Correct Table**
```sql
-- OLD: SELECT 1 FROM auto_cars WHERE id = p_car_id
-- NEW: SELECT 1 FROM cars WHERE id = p_car_id
```

**✅ Insert Only Existing Columns**
```sql
INSERT INTO auto_expenses (
  car_id,
  deal_id,
  type,
  amount,
  currency,
  description,
  paid_by,
  owner_share,
  cashbox_id,      -- NULL initially
  transaction_id,  -- NULL initially
  created_by_employee_id,
  expense_date
) VALUES (...)
-- NO company_part, NO owner_part columns
```

**✅ Use Correct Category**
```sql
-- OLD: p_category := 'AUTO_EXPENSE'
-- NEW: p_category := 'EXPENSE'
```

**✅ Update Cars Table Cost**
```sql
-- OLD: UPDATE auto_cars SET cost_price = cost_price + v_company_part
-- NEW: UPDATE cars SET cost_price = COALESCE(cost_price, 0) + p_amount
```
Note: Full `p_amount` is added to cost_price, not just company_part

**✅ Company Part Calculation**
```sql
IF p_paid_by = 'COMPANY' THEN
  v_company_part := p_amount;
ELSIF p_paid_by = 'OWNER' THEN
  v_company_part := 0;
ELSIF p_paid_by = 'SHARED' THEN
  v_company_part := GREATEST(0, p_amount - COALESCE(p_owner_share, 0));
ELSE
  RAISE EXCEPTION 'Invalid paid_by value';
END IF;
```

### 3. Execution Flow

1. **Validate** amount > 0, car exists in `cars` table
2. **Calculate** company_part from paid_by logic
3. **INSERT** expense record with NULL transaction_id/cashbox_id
4. **If cashbox provided and company_part > 0**:
   - Validate cashbox currency matches
   - Create transaction via `cashbox_operation_v2` with:
     - `p_amount := -company_part` (negative for withdrawal)
     - `p_category := 'EXPENSE'` (not AUTO_EXPENSE)
     - `p_reference_id := expense_id`
   - UPDATE expense with transaction_id and cashbox_id
5. **UPDATE** cars.cost_price with full amount
6. **INSERT** audit_log_v2
7. **RECALC P&L** (wrapped in exception handler)

### 4. P&L Integration

After expense is created:
- If `p_deal_id` provided → recalc that deal
- If no deal → find active deal (NEW/IN_PROGRESS) for this car and recalc
- Errors in P&L don't break expense creation (wrapped in exception handler)

## Testing Checklist

✅ Migration applies on clean DB (no auto_cars table)  
✅ `cars` table validation works  
✅ Expense created without company_part/owner_part columns  
✅ Transaction created with category='EXPENSE'  
✅ cars.cost_price updated with full amount  
✅ Audit log records correct data  
✅ P&L recalculation triggered  
✅ P&L errors don't break expense creation

## Files Changed

- `scripts/026_fix_auto_payment_rpc_overload_and_pnl.sql` (PART C)

## Integration Points

- ✅ Compatible with `app/actions/auto.ts` → `recordAutoExpenseV2`
- ✅ Works with `cashbox_operation_v2` via EXPENSE category
- ✅ Integrates with `auto_recalc_pnl_v2` for P&L updates
- ✅ Uses correct `cars` and `auto_expenses` tables

## Migration Path

**Order**: Run after migrations 001-025  
**Idempotent**: Yes (uses DROP FUNCTION IF EXISTS and CREATE OR REPLACE)  
**Rollback**: Not needed (fixes broken function)

## Notes

- PART A and PART B remain unchanged (payment v2 is correct)
- Only PART C was rewritten for clean DB compatibility
- Function signature unchanged for backward compatibility
- Full architectural alignment with existing schema
