# DB Login Audit - NULL created_at Fix

## Summary

Fixed the DB-level login audit trigger to handle cases where `created_at` in `auth.audit_log_entries` might be NULL (e.g., during manual simulation/testing).

## Problem

When manually inserting test records into `auth.audit_log_entries` with `created_at = NULL`, the trigger function would insert NULL timestamps into `audit_log`, causing issues with timestamp-based queries and sorting.

## Solution

Added `coalesce(NEW.created_at, now())` to ensure a valid timestamp is always used, even when `created_at` is NULL in the source table.

## Changes Made

### 1. scripts/005b_auth_login_audit.sql

**Added**:
- Variable `ts TIMESTAMPTZ` declared in function
- `ts := COALESCE(NEW.created_at, now())` at the beginning of function logic
- Used `ts` instead of `NEW.created_at` in both:
  - `new_data->>'timestamp'` field in JSON
  - `created_at` column in INSERT statement

**Preserved**:
- `SECURITY DEFINER` with `SET search_path = public`
- Idempotent structure (`DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE FUNCTION`)
- All existing payload compatibility logic
- Company ID lookup from employees table
- Graceful error handling

### 2. AUDIT_LOGIN_CHECK.md

**Added**:
- Note under "Logged Data Structure" section explaining:
  - `created_at` can be NULL during manual simulation
  - Function uses fallback to `now()` when NULL is encountered
  - Ensures valid timestamp is always recorded

## Verification Commands

\`\`\`bash
# 1. Unicode Check
pnpm check:unicode

# 2. TypeScript Check
pnpm tsc --noEmit

# 3. Build
pnpm build
\`\`\`

## Verification Results

✅ **Unicode Check**: Passed - No dangerous Unicode characters found
✅ **Build**: Successful - No errors
✅ **TypeScript**: Passed - No type errors

## SQL Changes Detail

**Before**:
\`\`\`sql
INSERT INTO audit_log (
  ...
  created_at
) VALUES (
  ...
  NEW.created_at  -- Could be NULL!
);
\`\`\`

**After**:
\`\`\`sql
DECLARE
  ts TIMESTAMPTZ;
BEGIN
  ts := COALESCE(NEW.created_at, now());
  
  INSERT INTO audit_log (
    ...
    created_at
  ) VALUES (
    ...
    ts  -- Always valid timestamp
  );
END;
\`\`\`

## Impact

- **Zero breaking changes**: Existing functionality preserved
- **Improved robustness**: Handles edge cases in testing/simulation
- **Backward compatible**: Works with all existing data
- **No client changes needed**: This is a DB-only fix

## Testing Recommendations

### Test Case 1: Normal Login (Real Supabase Auth)
\`\`\`sql
-- Should work as before, created_at populated by Supabase
-- Login via UI → check audit_log
\`\`\`

### Test Case 2: Manual Simulation with NULL
\`\`\`sql
-- Insert test event with NULL created_at
INSERT INTO auth.audit_log_entries (
  instance_id,
  ip_address,
  payload
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '127.0.0.1',
  jsonb_build_object(
    'action', 'login',
    'user_id', 'test-user-id',
    'email', 'test@example.com'
  )
);
-- created_at defaults to NULL or now(), trigger should handle both
\`\`\`

### Test Case 3: Verify Fallback
\`\`\`sql
-- Check that timestamps are never NULL in audit_log
SELECT count(*) 
FROM audit_log 
WHERE table_name = 'auth_events' 
  AND created_at IS NULL;
-- Expected: 0
\`\`\`

## Files Modified

1. **scripts/005b_auth_login_audit.sql** - Added coalesce for created_at handling
2. **AUDIT_LOGIN_CHECK.md** - Added documentation note about NULL handling

## Deployment Instructions

1. Apply updated SQL script in Supabase SQL Editor:
   \`\`\`sql
   -- Run contents of scripts/005b_auth_login_audit.sql
   \`\`\`

2. Verify trigger is updated:
   \`\`\`sql
   SELECT 
     p.proname,
     pg_get_functiondef(p.oid) as definition
   FROM pg_proc p
   WHERE p.proname = 'log_auth_login_to_audit';
   \`\`\`

3. Check for `COALESCE(NEW.created_at, now())` in the function definition

## Backward Compatibility

✅ **Fully backward compatible**
- Existing audit_log records unchanged
- Function signature unchanged
- Trigger behavior unchanged for normal cases
- Only adds safety for NULL edge case

## Next Steps

- Deploy to production via Supabase SQL Editor
- Monitor audit_log for any issues
- Verify timestamps are always populated
- Remove any manual test data if present

---

**Status**: ✅ Ready for deployment
**Risk Level**: Low (defensive programming, no breaking changes)
**Testing**: Verified locally with unicode check and build
