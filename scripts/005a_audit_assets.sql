-- 005a: Audit log + Assets tables

-- AUDIT LOG V2
CREATE TABLE IF NOT EXISTS audit_log_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id UUID NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before JSONB NULL,
  after JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_v2_module_created ON audit_log_v2(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_v2_actor_created ON audit_log_v2(actor_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_v2_entity ON audit_log_v2(entity_table, entity_id);

-- ASSETS
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_stock',
  owner_contact_id UUID NULL REFERENCES contacts(id),
  responsible_employee_id UUID NULL,
  notes TEXT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  visibility_mode TEXT DEFAULT 'public',
  allowed_role_codes TEXT[] DEFAULT '{}'::text[],
  client_audience_notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_assets_responsible ON assets(responsible_employee_id);

DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ASSET LOCATIONS
CREATE TABLE IF NOT EXISTS asset_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ASSET LOCATION MOVES
CREATE TABLE IF NOT EXISTS asset_location_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_location_id UUID NULL REFERENCES asset_locations(id),
  to_location_id UUID NULL REFERENCES asset_locations(id),
  moved_at TIMESTAMPTZ DEFAULT now(),
  moved_by_employee_id UUID NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_moves_asset ON asset_location_moves(asset_id);

-- ASSET VALUATIONS
CREATE TABLE IF NOT EXISTS asset_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  valuation_amount NUMERIC NOT NULL,
  valuation_currency TEXT NOT NULL,
  base_amount NUMERIC NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC NULL,
  source_note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_employee_id UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_valuations_asset ON asset_valuations(asset_id, created_at DESC);

-- ASSET SALE EVENTS
CREATE TABLE IF NOT EXISTS asset_sale_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  related_finance_deal_id UUID NULL,
  sold_at TIMESTAMPTZ DEFAULT now(),
  sale_amount NUMERIC NOT NULL,
  sale_currency TEXT NOT NULL,
  base_amount NUMERIC NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC NULL,
  distribution JSONB DEFAULT '{}'::jsonb,
  created_by_employee_id UUID NULL,
  visibility_mode TEXT DEFAULT 'public',
  allowed_role_codes TEXT[] DEFAULT '{}'::text[],
  client_audience_notes JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_asset_sale_events_asset ON asset_sale_events(asset_id);
