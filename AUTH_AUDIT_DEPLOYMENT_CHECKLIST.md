# Auth Login Audit - Deployment Checklist

**Branch**: v0-async-button-component  
**Repository**: https://github.com/cielo1304/v0-async-button-component.git  
**Status**: ✅ Ready for Deployment

---

## Pre-Deployment Verification

### Code Quality Checks

- [ ] **Unicode Check**: Run `pnpm check:unicode`
  - Expected: ✅ "No dangerous Unicode characters found."
  
- [ ] **Build Check**: Run `pnpm build`
  - Expected: Build completes successfully
  
- [ ] **TypeScript Check**: Run `pnpm tsc --noEmit`
  - Expected: No TypeScript errors

### Code Review Checklist

- [x] **No client-side login auditing code**
  - [x] No `auth-listener.tsx` file exists
  - [x] No `onAuthStateChange` usage in codebase
  - [x] No `SIGNED_IN` event handlers
  - [x] No login-specific `logAudit` calls
  
- [x] **Documentation updated**
  - [x] `AUDIT_LOGIN_CHECK.md` reflects DB trigger approach
  - [x] `coalesce(created_at, now())` mechanism documented
  - [x] Testing guide complete
  
- [x] **Migration ready**
  - [x] `scripts/005b_auth_login_audit.sql` exists
  - [x] SQL is idempotent (safe to re-run)
  - [x] Trigger function uses SECURITY DEFINER with fixed search_path

---

## Deployment Steps

### Step 1: Code Deployment

**Action**: Merge or pull branch `v0-async-button-component`

```bash
# If deploying from local
git checkout v0-async-button-component
git pull origin v0-async-button-component

# If deploying to production
git checkout main
git merge v0-async-button-component
git push origin main
```

- [ ] Code deployed to environment
- [ ] Application restarted/rebuilt
- [ ] No errors in deployment logs

### Step 2: Database Migration (CRITICAL)

**IMPORTANT**: This must be done AFTER code deployment.

**Action**: Apply SQL migration in Supabase

1. [ ] Open Supabase Dashboard for project
2. [ ] Navigate to: **SQL Editor** → **New Query**
3. [ ] Copy entire contents of `scripts/005b_auth_login_audit.sql`
4. [ ] Click **Run**
5. [ ] Verify success message: `Success. No rows returned`

**Alternative (CLI)**:
```bash
supabase db execute --file scripts/005b_auth_login_audit.sql
```

### Step 3: Verify Trigger Installation

**Action**: Check trigger is active

Run this query in Supabase SQL Editor:

```sql
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as enabled,
  tgtype as trigger_type
FROM pg_trigger
WHERE tgname = 'trigger_log_auth_login';
```

**Expected Result**:
```
trigger_name             | table_name              | enabled | trigger_type
------------------------|-------------------------|---------|-------------
trigger_log_auth_login  | auth.audit_log_entries  | O       | 5
```

- [ ] Trigger exists
- [ ] `enabled = 'O'` (enabled)
- [ ] On table `auth.audit_log_entries`

### Step 4: Verify Function Installation

**Action**: Check function exists

```sql
SELECT 
  proname as function_name,
  prosecdef as security_definer,
  provolatile as volatility
FROM pg_proc
WHERE proname = 'log_auth_login_to_audit';
```

**Expected Result**:
```
function_name           | security_definer | volatility
------------------------|------------------|------------
log_auth_login_to_audit | true            | v
```

- [ ] Function exists
- [ ] `security_definer = true`

---

## Post-Deployment Testing

### Test 1: Regular User Login ✅

**Steps**:
1. [ ] Sign out of application completely
2. [ ] Sign in with regular employee account (has company_id)
3. [ ] Run verification query:

```sql
SELECT 
  id,
  created_at,
  table_name,
  new_data->>'event' as event_type,
  new_data->>'email' as email,
  new_data->>'company_id' as company_id,
  new_data->>'provider' as provider,
  new_data->>'ip_address' as ip_address
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**:
- [ ] New row appears with your email
- [ ] `company_id` is populated with UUID
- [ ] `created_at` matches login time (not NULL)
- [ ] `provider` shows correct auth method
- [ ] `ip_address` is populated

### Test 2: Platform Admin Login ✅

**Steps**:
1. [ ] Sign out
2. [ ] Sign in with platform admin account
3. [ ] Run same query as Test 1

**Expected**:
- [ ] New row with admin email
- [ ] `company_id` is NULL (this is CORRECT)
- [ ] `created_at` is valid
- [ ] Login logged successfully

### Test 3: No Duplicates on Refresh ✅

**Steps**:
1. [ ] Stay logged in
2. [ ] Refresh browser page 5 times
3. [ ] Run query from Test 1

**Expected**:
- [ ] NO new entries appear
- [ ] Only initial login is logged
- [ ] Count of rows unchanged

### Test 4: Different Auth Methods ✅

**Test each available method**:
- [ ] Email/password login
- [ ] Google OAuth (if configured)
- [ ] GitHub OAuth (if configured)
- [ ] Magic link (if configured)

**Expected**:
- [ ] All methods log correctly
- [ ] `provider` field reflects auth method

### Test 5: Timestamp Safety ✅

**Action**: Check all timestamps are valid

```sql
SELECT 
  COUNT(*) as total_logins,
  COUNT(created_at) as logins_with_timestamp,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in';
```

**Expected**:
- [ ] `total_logins = logins_with_timestamp` (no NULL timestamps)
- [ ] Timestamps are reasonable (within expected time range)

---

## Monitoring & Alerts

### Daily Monitoring Queries

**1. Login Activity (Last 24h)**:
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as logins,
  COUNT(DISTINCT new_data->>'email') as unique_users
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
  AND created_at > now() - interval '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**2. Failed Triggers (if any)**:
```sql
-- Check for auth events that might not have triggered
SELECT 
  COUNT(*) as auth_events_logged,
  MAX(created_at) as latest_auth_event
FROM auth.audit_log_entries
WHERE payload->>'action' = 'login';

-- Compare with our audit_log
SELECT 
  COUNT(*) as our_audit_entries,
  MAX(created_at) as latest_our_entry
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in';
```

**Expected**: Counts should match (or be very close)

### Alert Conditions

Set up alerts for:
- [ ] **No login audits in 1 hour** (during business hours)
  - Might indicate trigger disabled or broken
  
- [ ] **Sudden spike in login failures**
  - Check `auth.audit_log_entries` for failed login attempts
  
- [ ] **NULL timestamps appearing**
  - Should never happen with `coalesce()`, but monitor

---

## Rollback Plan

If issues are discovered:

### Immediate Rollback (Disable Trigger)

**Action**: Temporarily disable trigger without removing it

```sql
ALTER TABLE auth.audit_log_entries 
DISABLE TRIGGER trigger_log_auth_login;
```

- [ ] Trigger disabled
- [ ] Login auditing stopped
- [ ] Application still functions normally

**Re-enable when ready**:
```sql
ALTER TABLE auth.audit_log_entries 
ENABLE TRIGGER trigger_log_auth_login;
```

### Full Rollback (Remove Trigger)

**Action**: Completely remove trigger and function

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS trigger_log_auth_login 
ON auth.audit_log_entries;

-- Drop function
DROP FUNCTION IF EXISTS log_auth_login_to_audit();
```

- [ ] Trigger removed
- [ ] Function removed
- [ ] Can be re-applied later with migration script

**Note**: Existing audit_log entries are preserved even after rollback.

---

## Success Criteria

All must be true:

- [ ] Code deployed successfully
- [ ] Database migration applied
- [ ] Trigger verified as enabled
- [ ] Test 1 passed (regular user login)
- [ ] Test 2 passed (platform admin login)
- [ ] Test 3 passed (no duplicates)
- [ ] Test 4 passed (multiple auth methods)
- [ ] Test 5 passed (no NULL timestamps)
- [ ] No errors in application logs
- [ ] No errors in Supabase logs
- [ ] Monitoring queries return expected results

---

## Documentation References

- **Full Guide**: `AUDIT_LOGIN_CHECK.md`
- **Implementation Details**: `DB_LEVEL_AUTH_AUDIT_COMPLETE.md`
- **Cleanup Report**: `AUTH_LOGIN_AUDIT_FINAL_CLEANUP.md`
- **Russian Summary**: `AUTH_AUDIT_CLEANUP_SUMMARY_RU.md`
- **SQL Migration**: `scripts/005b_auth_login_audit.sql`

---

## Support Contacts

**Issues**:
- Check `AUDIT_LOGIN_CHECK.md` troubleshooting section first
- Review Supabase logs in Dashboard → Logs
- Check application error logs

**Questions**:
- Review documentation in order listed above
- Check `auth.audit_log_entries` to see raw Supabase auth events
- Compare with `audit_log` to verify trigger is working

---

## Final Sign-Off

**Deployment Approved By**: _________________  
**Date**: _________________  
**Environment**: [ ] Staging  [ ] Production  
**Post-Deployment Tests Passed**: [ ] Yes  [ ] No  

**Notes**:
_______________________________________________
_______________________________________________
_______________________________________________

---

**Status**: ✅ Ready for deployment  
**Last Updated**: 2025-01-XX  
**Version**: 1.0
