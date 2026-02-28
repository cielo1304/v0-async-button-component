-- ================================================================
-- 056_employee_invite_links.sql
-- Company-level invite links (no pre-existing employee required)
-- Boss generates a copyable link; new employee activates via onboarding.
-- ================================================================

-- 1. New table: employee_invite_links
--    Unlike employee_invites (which requires a pre-created employee +
--    email match), this is a company-scoped token anyone can use once.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'sent'
             CHECK (status IN ('sent', 'accepted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ NULL,
  accepted_by UUID NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_invite_links_company
  ON public.employee_invite_links(company_id);

CREATE INDEX IF NOT EXISTS idx_employee_invite_links_token
  ON public.employee_invite_links(token);

-- 2. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.employee_invite_links ENABLE ROW LEVEL SECURITY;

-- Members of the same company can select their own company's links
CREATE POLICY "employee_invite_links_select"
  ON public.employee_invite_links FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- Members can insert links for their own company
CREATE POLICY "employee_invite_links_insert"
  ON public.employee_invite_links FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- Members can delete links for their own company
CREATE POLICY "employee_invite_links_delete"
  ON public.employee_invite_links FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow unauthenticated reads only on the token column for the onboarding
-- validation step (no auth session yet when user opens the link).
-- We use a SECURITY DEFINER RPC for acceptance instead, so no anon policy needed.

-- 3. RPC: accept_employee_invite_link(p_token, p_full_name)
--    - Validates token (status='sent', not expired)
--    - Creates employees row (company_id from token, no permissions by default)
--    - Creates team_members row (role='member')
--    - Marks invite accepted
--    - Does NOT assign any module roles (zero permissions by default)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_employee_invite_link(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.accept_employee_invite_link(
  p_token    UUID,
  p_full_name TEXT
)
RETURNS UUID   -- returns new employee_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_link       RECORD;
  v_employee_id UUID;
  v_auth_uid   UUID;
  v_auth_email TEXT;
BEGIN
  -- Require authentication
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get email from auth
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = v_auth_uid;

  -- Fetch and lock the invite link
  SELECT * INTO v_link
  FROM employee_invite_links
  WHERE token = p_token
    AND status = 'sent'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_active';
  END IF;

  -- Check expiry
  IF v_link.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Check if this auth user is already a member of this company
  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = v_auth_uid
      AND company_id = v_link.company_id
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  -- Create employee record (zero permissions by default)
  INSERT INTO employees (
    company_id,
    full_name,
    auth_user_id,
    email,
    is_active,
    modules,
    module_access,
    module_visibility,
    hired_at
  ) VALUES (
    v_link.company_id,
    trim(p_full_name),
    v_auth_uid,
    v_auth_email,
    true,
    ARRAY[]::TEXT[],
    '{}'::JSONB,
    '{"exchange":{"scope":"all"},"auto":{"scope":"all"},"deals":{"scope":"all"},"stock":{"scope":"all"}}'::JSONB,
    now()
  )
  RETURNING id INTO v_employee_id;

  -- Create team membership
  INSERT INTO team_members (company_id, user_id, employee_id, member_role, created_at)
  VALUES (v_link.company_id, v_auth_uid, v_employee_id, 'member', now())
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET employee_id = EXCLUDED.employee_id,
        updated_at  = now();

  -- Mark invite accepted
  UPDATE employee_invite_links
  SET status      = 'accepted',
      accepted_at = now(),
      accepted_by = v_auth_uid
  WHERE id = v_link.id;

  RETURN v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_employee_invite_link(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.accept_employee_invite_link IS
'Accept a company invite link. Creates a new employee and team membership with zero module permissions.';

-- 4. Also allow anonymous SELECT on employee_invite_links for token validation
--    (The RPC is SECURITY DEFINER so it bypasses RLS, but for the onboarding
--    page to check a token before login we use the RPC directly — no anon read needed.)
