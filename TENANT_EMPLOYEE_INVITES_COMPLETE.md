# Tenant Employee Invites System - Implementation Complete

**Date:** 2025-01-XX  
**Status:** ✅ Complete

## Overview

Implemented company-scoped employee invite system where bosses (company owners) can invite employees into their company. Employee invites link authenticated users to existing employee records and create team memberships with proper role assignments. All data access is scoped by company_id to prevent global leaks.

---

## What Changed

### 1. Database Migration

#### `/scripts/052_accept_employee_invite.sql` (NEW)

**Purpose:** RPC function to accept employee invites

**Function:** `public.accept_employee_invite(p_token UUID) RETURNS UUID`

**Security:** `SECURITY DEFINER` - allows updating `employees.auth_user_id` 

**Flow:**
1. Validates auth user is logged in
2. Fetches invite by token where `status='sent'`
3. Checks email matches between invite and auth user
4. Checks invite not expired (`expires_at`)
5. Gets employee's `company_id`
6. Updates `employees`:
   - Sets `auth_user_id = auth.uid()`
   - Sets `is_active = true`
7. Marks invite as `accepted`
8. Creates or updates `team_members` record:
   - Links `company_id`, `user_id`, `employee_id`
   - Sets `member_role = 'member'`
9. Calls `sync_employee_roles_to_user_roles()` if exists
10. Returns `employee_id`

**Error Handling:**
- `'Not authenticated'` - no auth.uid()
- `'Invalid or expired invite'` - token not found or wrong status
- `'Invite email does not match your account'` - email mismatch
- `'Invite has expired'` - past `expires_at`
- `'Employee has no company assigned'` - missing `company_id`

**Grants:** `authenticated` users

---

### 2. Server Actions - Company Scoping

#### `/app/actions/team.ts`

**Updated: `createEmployee()`**
- Before: No company scoping
- After: 
  - Fetches current user's `company_id` from `team_members`
  - Inserts employee with `company_id` field
  - Throws error if user has no membership

**New: `listEmployees()`**
- Fetches current user's `company_id`
- Returns only employees where `employees.company_id = user's company_id`
- Prevents cross-company data leaks

**Updated: `deactivateEmployee(employeeId)`**
- Fetches user's `company_id`
- Verifies employee belongs to same company
- Throws error if company mismatch (access denied)

**Updated: `createEmployeeInvite(employeeId, email)`**
- Fetches user's `company_id`
- Verifies employee belongs to same company before creating invite
- Updates employee's email if provided
- Cancels previous active invites for same employee
- Creates new invite with UUID token, 7-day expiration
- Returns invite object with token

**All Actions Now Check Membership:**
- Every action starts with checking `team_members` for user's `company_id`
- Prevents users without membership from accessing data
- Ensures all operations are company-scoped

---

#### `/app/actions/tenant.ts`

**New: `acceptEmployeeInvite(token)`**
- Calls `accept_employee_invite` RPC with token
- Returns `employeeId` on success
- Returns `error` message on failure
- Error handling with try-catch and console logging

---

### 3. UI Updates

#### `/app/onboarding/page.tsx`

**Added Employee Invite Support:**

**Query Params:**
- `?token=<uuid>` - Pre-fills token field
- `?type=employee` - Switches to employee invite mode (default: `company`)

**Employee Mode (`type=employee`):**
- Title: "Присоединиться к команде"
- Description: "Введите токен приглашения для присоединения к компании"
- Only token field shown (no fullName field)
- Calls `acceptEmployeeInvite(token)`
- Success message: "Приглашение принято! Вы добавлены в команду."

**Company Mode (default):**
- Title: "Активация аккаунта"
- Both token and fullName fields shown
- Calls `acceptCompanyInvite(token, fullName)`
- Success message: "Приглашение активировано! Добро пожаловать."

**Validation:**
- Employee mode: Only token required
- Company mode: Both token and fullName required
- UUID format validation (36 characters)

**Flow:**
1. User clicks invite link: `/onboarding?token=<uuid>&type=employee`
2. Form pre-fills token, hides fullName field
3. User clicks "Активировать"
4. Calls `acceptEmployeeInvite(token)`
5. On success: redirects to `?next=` param or `/`

---

#### `/components/team/team-manager.tsx`

**Updated: `handleSendInvite()`**

**Before:**
- Called `createEmployeeInvite()`
- Showed generic success toast

**After:**
- Calls `createEmployeeInvite()` and receives invite object with token
- Constructs invite link: `/onboarding?token=<uuid>&type=employee`
- Copies link to clipboard automatically
- Shows detailed success toast:
  - Message: "Приглашение создано! Ссылка скопирована в буфер обмена"
  - Description: Shows full invite link
  - Duration: 10 seconds
- Error logging with `[v0]` prefix

**User Flow:**
1. Boss navigates to Settings → Team
2. Creates new employee or edits existing
3. Enters employee email
4. Clicks "Отправить приглашение" button
5. System creates invite token
6. Invite link auto-copied to clipboard
7. Boss shares link with employee via email/messenger
8. Employee clicks link → activates account → joins team

---

### 4. Security & Access Control

**Company Scoping Enforcement:**
- ✅ All employee CRUD operations check user's `company_id`
- ✅ `listEmployees()` filters by company
- ✅ `createEmployee()` sets company_id from membership
- ✅ `deactivateEmployee()` verifies company ownership
- ✅ `createEmployeeInvite()` verifies employee belongs to same company

**Row-Level Security (Implicit):**
- Middleware checks team membership before allowing access
- Server actions verify membership on every call
- No direct table access bypasses company checks

**No Global Leaks:**
- Employees cannot see other companies' data
- Invites are company-scoped by employee's `company_id`
- RPC validates email match and company association

---

## Database Schema Assumptions

Based on implementation, these columns must exist:

### `employees` table:
- `id` (UUID, PK)
- `company_id` (UUID) - links to companies
- `auth_user_id` (UUID, nullable) - links to auth.users
- `email` (TEXT)
- `is_active` (BOOLEAN)
- `full_name`, `position`, `phone`, `hired_at`, `notes`
- `modules` (JSONB array)
- `module_access` (JSONB)
- `module_visibility` (JSONB)

### `employee_invites` table:
- `id` (UUID, PK)
- `employee_id` (UUID, FK → employees)
- `email` (TEXT)
- `status` (TEXT: 'draft'|'sent'|'accepted'|'cancelled')
- `token` (TEXT, UUID)
- `expires_at` (TIMESTAMPTZ)
- `invited_at` (TIMESTAMPTZ)
- `invited_by` (UUID)

### `team_members` table:
- `id` (UUID, PK)
- `company_id` (UUID)
- `user_id` (UUID, FK → auth.users)
- `employee_id` (UUID, FK → employees)
- `member_role` (TEXT)
- `created_at` (TIMESTAMPTZ)
- Unique constraint on `(user_id, company_id)`

---

## Testing Checklist

### ✅ Boss Flow (Owner/Manager)
- [ ] Create employee in team manager
- [ ] Enter employee email
- [ ] Click "Отправить приглашение"
- [ ] Verify invite link copied to clipboard
- [ ] Verify link format: `/onboarding?token=<uuid>&type=employee`
- [ ] Verify toast shows link for 10 seconds

### ✅ Employee Flow (New User)
- [ ] Receive invite link from boss
- [ ] Click link → redirects to `/onboarding?token=...&type=employee`
- [ ] Verify title: "Присоединиться к команде"
- [ ] Verify only token field shown (no fullName field)
- [ ] Must be logged in first (middleware redirects to `/login`)
- [ ] After login, auto-redirects back to onboarding
- [ ] Click "Активировать"
- [ ] Verify success: "Приглашение принято! Вы добавлены в команду."
- [ ] Verify redirect to dashboard

### ✅ Employee Flow (Existing User)
- [ ] Already logged in
- [ ] Click invite link
- [ ] Token pre-filled
- [ ] Click "Активировать"
- [ ] Verify `employees.auth_user_id` updated
- [ ] Verify `team_members` record created
- [ ] Verify employee roles synced to `user_roles`

### ✅ Security Checks
- [ ] Employee cannot accept invite with wrong email
- [ ] Expired invites (>7 days) are rejected
- [ ] Token status must be 'sent' (not 'accepted'/'cancelled')
- [ ] Boss can only invite employees in their company
- [ ] `listEmployees()` only shows same-company employees
- [ ] Cannot deactivate employees from other companies

### ✅ Edge Cases
- [ ] Re-sending invite cancels previous active invite
- [ ] Accepting invite marks it as 'accepted'
- [ ] Employee email can be updated when creating invite
- [ ] Invite link works after user logs out and logs back in
- [ ] Multiple bosses in same company can all create invites

---

## Files Changed

### New Files (1):
- `/scripts/052_accept_employee_invite.sql` - RPC migration

### Modified Files (4):
- `/app/actions/team.ts` - Company scoping, listEmployees
- `/app/actions/tenant.ts` - acceptEmployeeInvite action
- `/app/onboarding/page.tsx` - Employee invite mode
- `/components/team/team-manager.tsx` - Invite link generation

---

## Next Steps (Optional Enhancements)

### Email Integration:
- Implement actual email sending in `createEmployeeInvite()`
- Use Resend, SendGrid, or similar service
- Email template with invite link button

### Invite Management UI:
- Show list of pending invites in team manager
- Allow boss to cancel/resend invites
- Show invite expiration countdown

### Role Assignment UI:
- Allow boss to pre-assign roles when creating invite
- Employee inherits roles upon activation
- Position-based default roles applied automatically

### Audit Trail:
- Log invite creation in `audit_log`
- Log invite acceptance with timestamp
- Track who invited whom

---

## Notes

- Migration script should be executed before deploying changes
- Execute: `psql -f scripts/052_accept_employee_invite.sql`
- Or use Supabase dashboard SQL editor
- Invite links are valid for 7 days by default
- Boss must be a member of a company to create employees
- Employee activation is instant (no email confirmation required)
- System uses existing RBAC and role assignment infrastructure
