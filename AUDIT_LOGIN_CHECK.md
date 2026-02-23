# Login Audit Logging - DB-Level Implementation

## Overview

Login events are now logged **server-side at the database level** using a trigger on `auth.audit_log_entries`. This is the authoritative, secure method that prevents client-side tampering and ensures all logins are captured regardless of client behavior.

## Implementation

### Database-Level Trigger (Authoritative)

- **File**: `scripts/005b_auth_login_audit.sql`
- **Mechanism**: Trigger on `auth.audit_log_entries` (Supabase's internal auth audit table)
- **What it does**:
  - Listens for `INSERT` events in `auth.audit_log_entries`
  - When `payload->>'action' = 'login'`, automatically creates a record in `public.audit_log`
  - Extracts user info from payload with compatibility for different Supabase versions
  - Fetches `company_id` from `employees` table if available
  - Handles platform admins gracefully (company_id can be NULL)

### Security Features

- **SECURITY DEFINER**: Function runs with elevated privileges but with fixed `search_path = public`
- **No client interaction**: Login logging happens entirely in the database
- **Tamper-proof**: Client code cannot fake or skip login audit entries
- **Automatic**: Works for all authentication methods (password, OAuth, etc.)

## Setup Instructions

### Step 1: Apply SQL Migration

You **MUST** apply the SQL script to enable DB-level login auditing:

\`\`\`bash
# In Supabase Dashboard → SQL Editor, run:
scripts/005b_auth_login_audit.sql
\`\`\`

Or via CLI:
\`\`\`bash
supabase db execute --file scripts/005b_auth_login_audit.sql
\`\`\`

### Step 2: Verify Trigger Installation

Run this query in Supabase SQL Editor:

\`\`\`sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'trigger_log_auth_login';
\`\`\`

**Expected**: Should return one row showing the trigger is enabled.

## Verification Guide

### Test 1: Regular User Login

1. Sign out if currently logged in
2. Sign in with a regular user account (employee with company)
3. Run verification query:

\`\`\`sql
SELECT 
  id,
  table_name,
  record_id,
  new_data->>'event' as event_type,
  new_data->>'email' as email,
  new_data->>'company_id' as company_id,
  new_data->>'ip_address' as ip_address,
  new_data->>'provider' as provider,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
ORDER BY created_at DESC
LIMIT 20;
\`\`\`

**Expected**: 
- New row with your email
- `company_id` populated with your company UUID
- `ip_address` and `provider` populated
- `created_at` matching your login time

### Test 2: Platform Admin Login

1. Sign out
2. Sign in with a platform admin account
3. Run the same query above

**Expected**:
- New row with platform admin email
- `company_id` may be NULL (if admin not associated with a company) - **this is normal**
- Login is logged successfully regardless

### Test 3: No Duplicate Logging

1. Stay logged in
2. Refresh the page multiple times
3. Run the query again

**Expected**: 
- NO new rows should appear
- Only the initial login is logged
- Token refreshes do NOT create new audit entries

### Test 4: Check Raw Auth Events

To see what Supabase itself logs:

\`\`\`sql
SELECT 
  id,
  payload->>'action' as action,
  payload->>'user_id' as user_id,
  payload->>'email' as email,
  ip_address,
  created_at
FROM auth.audit_log_entries
WHERE payload->>'action' = 'login'
ORDER BY created_at DESC
LIMIT 10;
\`\`\`

This shows the source data that triggers our logging function.

## Analysis Queries

### Count Sign-Ins by User

\`\`\`sql
SELECT 
  new_data->>'email' as email,
  COUNT(*) as login_count,
  MAX(created_at) as last_login,
  MIN(created_at) as first_login
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
GROUP BY new_data->>'email'
ORDER BY login_count DESC;
\`\`\`

### Platform Admin Activity

\`\`\`sql
SELECT 
  id,
  new_data->>'email' as email,
  new_data->>'user_id' as user_id,
  new_data->>'ip_address' as ip_address,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
  AND (new_data->>'company_id' IS NULL OR new_data->>'company_id' = 'null')
ORDER BY created_at DESC
LIMIT 20;
\`\`\`

### Recent Login Activity (Last 24h)

\`\`\`sql
SELECT 
  new_data->>'email' as email,
  new_data->>'company_id' as company_id,
  new_data->>'ip_address' as ip_address,
  created_at
FROM audit_log
WHERE table_name = 'auth_events'
  AND new_data->>'event' = 'sign_in'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
\`\`\`

## Technical Details

### Payload Compatibility

The trigger function handles different Supabase payload formats:

```sql
-- User ID (different versions use different keys)
actor := COALESCE(
  NEW.payload->>'user_id',
  NEW.payload->>'actor_id'
);

-- Email
email := COALESCE(
  NEW.payload->>'email',
  NEW.payload->>'actor_username'
);

-- Provider (email, google, github, etc.)
provider := COALESCE(
  NEW.payload->'metadata'->>'provider',
  NEW.payload->'traits'->>'provider',
  'email'
);
```

### Timestamp Safety

The function uses `coalesce(NEW.created_at, now())` to ensure a valid timestamp is always recorded, even if `created_at` is NULL in test scenarios:

```sql
-- Insert into public.audit_log with safe timestamp
INSERT INTO public.audit_log (
  table_name,
  record_id,
  action,
  old_data,
  new_data,
  created_at
) VALUES (
  'auth_events',
  NEW.id::TEXT,
  'INSERT',
  NULL,
  jsonb_build_object(
    'event', 'sign_in',
    -- ... other fields
  ),
  coalesce(NEW.created_at, now())  -- Fallback to now() if NULL
);
```

### Company ID Resolution

```sql
-- Fetch from employees table
SELECT e.company_id INTO company_id
FROM employees e
WHERE e.auth_user_id = actor::UUID
LIMIT 1;

-- If no match found, company_id remains NULL
-- This is expected and correct for platform admins
```

### Logged Data Structure

Each login event in `audit_log` contains:

\`\`\`json
{
  "event": "sign_in",
  "user_id": "uuid-here",
  "email": "user@example.com",
  "company_id": "uuid-or-null",
  "timestamp": "2024-01-01T12:00:00Z",
  "ip_address": "192.168.1.1",
  "provider": "email",
  "payload": { /* full auth payload */ }
}
\`\`\`

**Note on Timestamps**: The trigger function handles cases where `created_at` in `auth.audit_log_entries` might be NULL (e.g., during manual simulation/testing). When NULL, it falls back to `now()` to ensure a valid timestamp is always recorded.

## Migration from Client-Side Logging

### What Changed

**Before (Client-Side)**:
- `components/auth/auth-listener.tsx` listened to `onAuthStateChange`
- Client code called `logAudit()` on `SIGNED_IN` event
- Vulnerable to client-side tampering or failures

**After (DB-Level)**:
- Trigger on `auth.audit_log_entries` handles everything
- No client code involved
- Guaranteed logging for all authentication events
- `components/auth/auth-listener.tsx` has been **removed**

### Why DB-Level is Better

1. **Security**: Cannot be bypassed or tampered with from client
2. **Reliability**: Works even if client code fails or is disabled
3. **Consistency**: Captures all auth events regardless of client state
4. **Simplicity**: No client-side dependencies or maintenance
5. **Performance**: No additional client→server round trips

## Troubleshooting

### No login events appearing

1. **Verify trigger exists**:
   \`\`\`sql
   SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_log_auth_login';
   \`\`\`

2. **Check auth.audit_log_entries is being populated**:
   \`\`\`sql
   SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action' = 'login';
   \`\`\`

3. **Check function exists**:
   \`\`\`sql
   SELECT proname FROM pg_proc WHERE proname = 'log_auth_login_to_audit';
   \`\`\`

4. **If trigger exists but not working, recreate it**:
   \`\`\`sql
   DROP TRIGGER IF EXISTS trigger_log_auth_login ON auth.audit_log_entries;
   -- Then re-run the CREATE TRIGGER statement from 005b_auth_login_audit.sql
   \`\`\`

### Platform admin login not logged

- Check that platform admin can actually authenticate
- Verify `employees` table is accessible (RLS policies)
- Platform admins without `company_id` should still log successfully (company_id will be NULL)

### Duplicate login entries

- This should NOT happen with the trigger approach
- If you see duplicates, check if old client-side code is still running
- Verify `components/auth/auth-listener.tsx` has been removed

## Build & Verification Commands

\`\`\`bash
# Check for dangerous Unicode characters
pnpm check:unicode

# Build (unicode check runs automatically via prebuild)
pnpm build

# Type check
pnpm tsc --noEmit
\`\`\`

## Summary

✅ **Server-side login auditing** via database trigger
✅ **Tamper-proof** - no client interaction required  
✅ **Works for all users** - employees and platform admins
✅ **Handles NULL company_id** gracefully for admins
✅ **Captures all auth methods** - password, OAuth, etc.
✅ **No duplicate logs** - only actual logins, not token refreshes
✅ **Client-side logging removed** - auth-listener.tsx deleted

**Remember**: You must apply `scripts/005b_auth_login_audit.sql` in Supabase to enable this feature!
