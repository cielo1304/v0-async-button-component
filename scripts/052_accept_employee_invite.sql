-- ================================================================
-- 052_accept_employee_invite.sql
-- Employee invite acceptance RPC for boss-initiated onboarding
-- ================================================================

-- Drop existing if any
DROP FUNCTION IF EXISTS public.accept_employee_invite(UUID);

-- Create RPC: accept_employee_invite
-- Purpose: Auth user accepts employee invite, links to existing employee record
-- Security: SECURITY DEFINER so it can update employees.auth_user_id
-- Returns: employee_id (UUID)
CREATE OR REPLACE FUNCTION public.accept_employee_invite(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_record RECORD;
  v_employee_id UUID;
  v_company_id UUID;
  v_auth_user_id UUID;
  v_auth_email TEXT;
BEGIN
  -- 1. Get current auth user info
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user email from auth.users
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = v_auth_user_id;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'User email not found';
  END IF;

  -- 2. Fetch and validate invite
  SELECT * INTO v_invite_record
  FROM employee_invites
  WHERE token = p_token::TEXT
    AND status = 'sent'
  FOR UPDATE; -- Lock row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  -- 3. Check email matches
  IF LOWER(v_invite_record.email) != LOWER(v_auth_email) THEN
    RAISE EXCEPTION 'Invite email does not match your account';
  END IF;

  -- 4. Check invite not expired
  IF v_invite_record.expires_at IS NOT NULL AND v_invite_record.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  v_employee_id := v_invite_record.employee_id;

  -- 5. Get employee's company_id
  SELECT company_id INTO v_company_id
  FROM employees
  WHERE id = v_employee_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Employee has no company assigned';
  END IF;

  -- 6. Update employee record: link auth_user_id and activate
  UPDATE employees
  SET 
    auth_user_id = v_auth_user_id,
    is_active = true,
    updated_at = NOW()
  WHERE id = v_employee_id;

  -- 7. Mark invite as accepted
  UPDATE employee_invites
  SET status = 'accepted'
  WHERE id = v_invite_record.id;

  -- 8. Create or update team membership
  -- Check if membership already exists
  INSERT INTO team_members (company_id, user_id, employee_id, member_role, created_at)
  VALUES (v_company_id, v_auth_user_id, v_employee_id, 'member', NOW())
  ON CONFLICT (user_id, company_id) DO UPDATE
  SET 
    employee_id = EXCLUDED.employee_id,
    updated_at = NOW();

  -- 9. Sync employee roles to user_roles (if function exists)
  BEGIN
    PERFORM sync_employee_roles_to_user_roles(v_employee_id);
  EXCEPTION
    WHEN undefined_function THEN
      -- Function doesn't exist yet, skip
      NULL;
  END;

  RETURN v_employee_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_employee_invite(UUID) TO authenticated;

-- Comment
COMMENT ON FUNCTION public.accept_employee_invite(UUID) IS 
'Accept employee invite by token. Links auth user to existing employee record, creates team membership, and syncs roles.';
