-- =========================================================
-- Migration 054: Entity Files Attachments System
-- Unified file attachments for assets and cars
-- =========================================================

-- 1) Create files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Create entity_files junction table
CREATE TABLE IF NOT EXISTS public.entity_files (
  company_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('asset', 'car')),
  entity_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, file_id)
);

-- 3) Create indexes
CREATE INDEX IF NOT EXISTS idx_files_company_id ON public.files(company_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_files_entity ON public.entity_files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_files_file_id ON public.entity_files(file_id);

-- 4) Enable RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_files ENABLE ROW LEVEL SECURITY;

-- 5) Create RLS policies for files
DROP POLICY IF EXISTS files_select ON public.files;
CREATE POLICY files_select ON public.files
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS files_insert ON public.files;
CREATE POLICY files_insert ON public.files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS files_delete ON public.files;
CREATE POLICY files_delete ON public.files
  FOR DELETE
  TO authenticated
  USING (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

-- 6) Create RLS policies for entity_files
DROP POLICY IF EXISTS entity_files_select ON public.entity_files;
CREATE POLICY entity_files_select ON public.entity_files
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS entity_files_insert ON public.entity_files;
CREATE POLICY entity_files_insert ON public.entity_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS entity_files_delete ON public.entity_files;
CREATE POLICY entity_files_delete ON public.entity_files
  FOR DELETE
  TO authenticated
  USING (
    company_id = (
      SELECT company_id 
      FROM public.employees 
      WHERE user_id = auth.uid() 
      LIMIT 1
    )
  );

-- 7) Grant permissions
GRANT SELECT, INSERT, DELETE ON public.files TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.entity_files TO authenticated;

-- Done!
