-- Migration 015: Cashboxes + Cashbox Locations Schema Patch
-- Adds missing columns to cashboxes and creates cashbox_locations table

-- 1) ALTER TABLE cashboxes - add missing columns
ALTER TABLE cashboxes 
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_exchange_enabled BOOLEAN DEFAULT false NOT NULL;

-- 2) CREATE TABLE cashbox_locations
CREATE TABLE IF NOT EXISTS cashbox_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3) Add updated_at trigger for cashbox_locations
DROP TRIGGER IF EXISTS update_cashbox_locations_updated_at ON cashbox_locations;
CREATE TRIGGER update_cashbox_locations_updated_at
  BEFORE UPDATE ON cashbox_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4) Backfill default locations if table is empty
INSERT INTO cashbox_locations (name, sort_order)
SELECT * FROM (VALUES 
  ('Офис', 1),
  ('Сейф', 2),
  ('Курьер', 3)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM cashbox_locations LIMIT 1);

-- 5) Backfill sort_order for existing cashboxes based on created_at
UPDATE cashboxes SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn 
  FROM cashboxes
) sub
WHERE cashboxes.id = sub.id AND cashboxes.sort_order = 0;
