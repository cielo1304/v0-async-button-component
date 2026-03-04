-- Migration 060: Add platform viewer support for view-as mode
-- This allows platform admins to temporarily become members of any company for read-only access

-- Add is_platform_viewer flag to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS is_platform_viewer boolean NOT NULL DEFAULT false;

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_employees_is_platform_viewer 
ON public.employees(is_platform_viewer) 
WHERE is_platform_viewer = true;

-- Add comment for documentation
COMMENT ON COLUMN public.employees.is_platform_viewer IS 
'True if this employee record was created for platform admin view-as mode. These records can be safely cleaned up.';
