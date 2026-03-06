-- ============================================================================
-- CLEANUP: Remove stale platform admin membership artifacts
-- ============================================================================
-- 
-- ROOT CAUSE: Old View-As implementation created real team_members rows for
-- platform admins (like `cielo`) to pass RLS checks. These stale rows cause:
-- 1. Platform admin seeing company A data outside View-As mode
-- 2. A+B merge when View-As switches to company B (RLS returns A union B)
--
-- This script:
-- 1. Finds all platform_admins users
-- 2. Removes their team_members rows that were created by View-As
--    (linked to viewer/system employees)
-- 3. Removes the viewer/system employees
-- 4. Also removes ANY team_members rows for platform admins that should
--    not be real company members
-- ============================================================================

-- Step 1: Find and remove viewer employees + their team_members links
-- Viewer employees have full_name starting with 'Просмотр (админ платформы)'
-- or is_system = true with null auth_user_id

-- Delete team_members rows linked to viewer employees
DELETE FROM team_members
WHERE employee_id IN (
  SELECT id FROM employees
  WHERE (
    full_name LIKE 'Просмотр (админ платформы)%'
    OR (is_system = true AND auth_user_id IS NULL)
  )
);

-- Delete the viewer employees themselves
DELETE FROM employees
WHERE (
  full_name LIKE 'Просмотр (админ платформы)%'
  OR (is_system = true AND auth_user_id IS NULL AND full_name LIKE '%админ%платформы%')
);

-- Step 2: Remove ALL team_members rows for known platform admins
-- Platform admins should NOT have real team_members rows unless they are
-- genuinely employees of a company (which cielo is not)
DELETE FROM team_members
WHERE user_id IN (
  SELECT user_id FROM platform_admins
)
AND employee_id IS NOT NULL
AND employee_id IN (
  SELECT id FROM employees
  WHERE is_system = true
    OR full_name LIKE 'Просмотр%'
    OR auth_user_id IS NULL
);

-- Step 3: Report what's left (for verification)
-- If this returns rows, those are REAL memberships that should be reviewed
SELECT 
  tm.id as team_member_id,
  tm.user_id,
  tm.company_id,
  tm.member_role,
  e.full_name as employee_name,
  e.is_system,
  c.name as company_name
FROM team_members tm
JOIN platform_admins pa ON pa.user_id = tm.user_id
LEFT JOIN employees e ON e.id = tm.employee_id
LEFT JOIN companies c ON c.id = tm.company_id;
