-- Migration 061: Add is_system column to employees table
-- This allows marking system/viewer employees that should be hidden from company UIs

-- 1. Add is_system column
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- 2. Create index for filtering
CREATE INDEX IF NOT EXISTS idx_employees_is_system ON public.employees (company_id, is_system) WHERE is_system = true;

-- 3. Backfill existing viewer employees as is_system = true
UPDATE public.employees
SET is_system = true
WHERE full_name = 'Просмотр (админ платформы)';

-- 4. Set auth_user_id to NULL for system viewer employees (to avoid UNIQUE constraint collisions)
UPDATE public.employees
SET auth_user_id = NULL
WHERE full_name = 'Просмотр (админ платформы)'
  AND auth_user_id IS NOT NULL;

-- 5. Comment for documentation
COMMENT ON COLUMN public.employees.is_system IS 'System employees (e.g. platform viewer) that should be hidden from company UIs';
