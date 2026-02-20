-- =========================================================
-- Migration: Extended fields for contacts
-- Adds first_name, last_name, mobile_phone, extra_phones,
-- organization, comment to public.contacts
-- Also adds search index
-- =========================================================

-- 1. Add new columns (idempotent with DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'first_name') THEN
    ALTER TABLE contacts ADD COLUMN first_name TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'last_name') THEN
    ALTER TABLE contacts ADD COLUMN last_name TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'mobile_phone') THEN
    ALTER TABLE contacts ADD COLUMN mobile_phone TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'extra_phones') THEN
    ALTER TABLE contacts ADD COLUMN extra_phones TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'organization') THEN
    ALTER TABLE contacts ADD COLUMN organization TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'comment') THEN
    ALTER TABLE contacts ADD COLUMN comment TEXT NULL;
  END IF;
END $$;

-- 2. B-tree indexes for search (ILIKE will seq-scan but these help ORDER BY / exact match)
CREATE INDEX IF NOT EXISTS idx_contacts_display_name ON contacts (display_name);
CREATE INDEX IF NOT EXISTS idx_contacts_mobile_phone ON contacts (mobile_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_organization ON contacts (organization);

-- 3. Backfill display_name from first_name + last_name for future inserts
-- (existing contacts already have display_name populated)
CREATE OR REPLACE FUNCTION trg_contacts_fill_display_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-compute display_name from first_name + last_name if not explicitly set
  IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
    NEW.display_name := COALESCE(
      NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''),
      'Без имени'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_fill_display_name ON contacts;
CREATE TRIGGER trg_contacts_fill_display_name
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trg_contacts_fill_display_name();
