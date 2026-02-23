# Login Audit Logging - Verification Guide

## Overview

This document describes how to verify that login events are properly logged to the `audit_log` table for all users, including platform admins.

## What Was Implemented

### 1. Unicode Check (Trojan Source Guard)

- **File**: `scripts/check-unicode.cjs`
- **Purpose**: Scans for dangerous Unicode characters (Bidi controls, invisibles) that could be used in Trojan Source attacks
- **Usage**:
  ```bash
  pnpm check:unicode           # Check for dangerous characters
  node scripts/check-unicode.cjs --fix  # Auto-remove found characters
  ```
- **Integration**: Added to `prebuild` script - runs automatically before `pnpm build`

### 2. Login Event Logging

- **Component**: `components/auth/auth-listener.tsx`
- **Integration**: Added to root layout (`app/layout.tsx`)
- **What it logs**:
  - User ID
  - Email
  - Company ID (if available, null for platform admins without company)
  - Timestamp
  - Event type: `sign_in`

**Behavior**:
- Logs only on `SIGNED_IN` events (not every render or token refresh)
- Works for all users: regular employees and platform admins
- Fetches `company_id` from `employees` table if available
- Gracefully handles platform admins who may not have a company association

## Manual Verification Steps

### Step 1: Test Regular User Login

1. Sign out if currently logged in
2. Sign in with a regular user account (employee with company)
3. Check that login was logged:

```sql
SELECT 
  id,
  table_name,
  record_id,
  action,
  new_data->>'event' as event_type,
  new_data->>'email' as email,
  new_data->>'company_id' as company_id,
  changed_by,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
ORDER BY created_at DESC
LIMIT 20;
```

**Expected**: You should see a new row with your email, company_id populated, and timestamp matching your login time.

### Step 2: Test Platform Admin Login

1. Sign out
2. Sign in with a platform admin account (superuser)
3. Run the same SQL query above

**Expected**: You should see a new row with:
- Platform admin email
- `company_id` might be NULL (if platform admin is not associated with a company)
- Event logged successfully regardless of company association

### Step 3: Verify No Duplicate Logging

1. Stay logged in
2. Refresh the page multiple times
3. Run the query again

**Expected**: No new rows should appear - login is only logged once on `SIGNED_IN`, not on token refresh or page reload.

## SQL Queries for Analysis

### View All Recent Sign-In Events

```sql
SELECT 
  id,
  new_data->>'email' as email,
  new_data->>'company_id' as company_id,
  new_data->>'timestamp' as login_timestamp,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
ORDER BY created_at DESC
LIMIT 50;
```

### Count Sign-Ins by User

```sql
SELECT 
  new_data->>'email' as email,
  COUNT(*) as login_count,
  MAX(created_at) as last_login
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
GROUP BY new_data->>'email'
ORDER BY login_count DESC;
```

### Platform Admin Logins (company_id is NULL)

```sql
SELECT 
  id,
  new_data->>'email' as email,
  new_data->>'user_id' as user_id,
  new_data->>'timestamp' as login_timestamp,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
  AND new_data->>'company_id' IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

## Technical Details

### Authentication Flow

1. User submits login credentials on `/login`
2. `supabase.auth.signInWithPassword()` is called
3. Supabase returns session with `SIGNED_IN` event
4. `AuthListener` component (mounted in root layout) receives the event
5. Component fetches `company_id` from `employees` table (if available)
6. `logAudit()` writes event to `audit_log` table
7. User is redirected to dashboard

### Platform Admin Considerations

- Platform admins are verified via `is_platform_admin` RPC (not by email or role_code)
- Platform admins may or may not have a `company_id`:
  - If they have an employee record: `company_id` is logged
  - If they don't: `company_id` is NULL
- Both cases are valid and properly logged
- No special handling needed - the audit system works for all user types

### Schema

The `audit_log` table structure (from `scripts/005a_foundation.sql`):

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,         -- 'auth_events' for login
  record_id TEXT NULL,               -- user_id
  action TEXT NOT NULL,              -- 'INSERT' for new login
  old_data JSONB NULL,               -- NULL for login events
  new_data JSONB NULL,               -- Contains: event, user_id, email, company_id, timestamp
  changed_by TEXT NULL,              -- user_id who performed action
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

## Build & Verification Commands

```bash
# Check for dangerous Unicode characters
pnpm check:unicode

# If dangerous characters found, auto-fix:
node scripts/check-unicode.cjs --fix
pnpm check:unicode

# Build (unicode check runs automatically via prebuild)
pnpm build

# Type check (if needed)
pnpm tsc --noEmit
```

## Troubleshooting

### No login events logged

1. Check browser console for errors from `[auth-listener]`
2. Verify `audit_log` table exists: `\d audit_log` in psql
3. Check that `AuthListener` is mounted in `app/layout.tsx`
4. Verify Supabase connection is working

### Platform admin login not logged

1. Verify platform admin can actually log in
2. Check that `employees` table query doesn't error (it should handle NULL gracefully)
3. Look for warnings in browser console: `[auth-listener] Could not fetch company_id`
4. Confirm that the `logAudit` call succeeds even without `company_id`

## Summary

✅ Unicode check script created and integrated into prebuild
✅ Login audit logging implemented via `AuthListener` component
✅ Works for all user types (regular employees and platform admins)
✅ Logs only actual sign-in events (not token refreshes)
✅ Handles missing `company_id` gracefully
✅ No UI changes required - purely backend/logging functionality
