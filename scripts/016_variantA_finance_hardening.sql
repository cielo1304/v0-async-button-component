-- Migration 016: Variant A Finance Hardening
-- Ensures finance deals work properly with mandatory schedules, audit logging, and currency validation

-- ==================== 1. CASHBOXES COLUMNS ====================

ALTER TABLE cashboxes 
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS is_exchange_enabled BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_phone TEXT;

-- ==================== 2. CASHBOX_LOCATIONS TABLE ====================

CREATE TABLE IF NOT EXISTS cashbox_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- updated_at trigger for cashbox_locations
DROP TRIGGER IF EXISTS update_cashbox_locations_updated_at ON cashbox_locations;
CREATE TRIGGER update_cashbox_locations_updated_at
  BEFORE UPDATE ON cashbox_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill default locations if empty
INSERT INTO cashbox_locations (name, sort_order)
SELECT * FROM (VALUES 
  ('Офис', 1),
  ('Сейф', 2),
  ('Курьер', 3)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM cashbox_locations LIMIT 1);

-- ==================== 3. INDEXES ====================
-- Note: cashbox_operation_v2 function is defined in migration 017

CREATE INDEX IF NOT EXISTS idx_cashboxes_sort_order ON cashboxes(sort_order);
CREATE INDEX IF NOT EXISTS idx_cashbox_locations_sort_order ON cashbox_locations(sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_deals_contract_currency ON finance_deals(contract_currency);
