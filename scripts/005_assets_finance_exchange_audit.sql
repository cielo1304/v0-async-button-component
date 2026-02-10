-- =========================================================
-- 005_assets_finance_exchange_audit.sql
-- Assets, Finance Deals, Exchange extensions, Audit Log,
-- Timeline views, RBAC roles
-- ADD-ONLY migration: no DROP, no RENAME
-- =========================================================

-- =========================================================
-- 1. AUDIT LOG
-- =========================================================
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

-- =========================================================
-- 2. ASSETS MODULE
-- =========================================================

-- 2.1 Assets (main table)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_stock',
  owner_contact_id UUID NULL REFERENCES contacts(id),
  responsible_employee_id UUID NULL,
  notes TEXT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  visibility_mode TEXT DEFAULT 'public' CHECK (visibility_mode IN ('public','restricted')),
  allowed_role_codes TEXT[] DEFAULT '{}'::text[],
  client_audience_notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_assets_responsible ON assets(responsible_employee_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2.2 Asset Locations (storage locations directory)
CREATE TABLE IF NOT EXISTS asset_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.3 Asset Location Moves (movement journal)
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

-- 2.4 Asset Valuations (manual valuation history)
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

-- 2.5 Asset Sale Events
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
  visibility_mode TEXT DEFAULT 'public' CHECK (visibility_mode IN ('public','restricted')),
  allowed_role_codes TEXT[] DEFAULT '{}'::text[],
  client_audience_notes JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_asset_sale_events_asset ON asset_sale_events(asset_id);

-- =========================================================
-- 3. FINANCE DEALS (new deal system, does NOT touch legacy deals)
-- =========================================================

-- 3.1 Core Deals (universal deal wrapper)
CREATE TABLE IF NOT EXISTS core_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'finance',
  subtype TEXT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  sub_status TEXT NULL,
  title TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'RUB',
  contact_id UUID NULL REFERENCES contacts(id),
  responsible_employee_id UUID NULL,
  client_audience_notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_core_deals_kind ON core_deals(kind);
CREATE INDEX IF NOT EXISTS idx_core_deals_status ON core_deals(status);
CREATE INDEX IF NOT EXISTS idx_core_deals_contact ON core_deals(contact_id);

DROP TRIGGER IF EXISTS update_core_deals_updated_at ON core_deals;
CREATE TRIGGER update_core_deals_updated_at
  BEFORE UPDATE ON core_deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3.2 Finance Deals (1:1 with core_deals)
CREATE TABLE IF NOT EXISTS finance_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_deal_id UUID UNIQUE NOT NULL REFERENCES core_deals(id) ON DELETE CASCADE,
  principal_amount NUMERIC NOT NULL,
  contract_currency TEXT NOT NULL DEFAULT 'RUB',
  term_months INT NOT NULL DEFAULT 12,
  rate_percent NUMERIC NOT NULL DEFAULT 0,
  schedule_type TEXT NOT NULL DEFAULT 'annuity',
  allow_tranches BOOLEAN DEFAULT false,
  rules JSONB DEFAULT '{}'::jsonb
);

-- 3.3 Finance Participants
CREATE TABLE IF NOT EXISTS finance_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  contact_id UUID NULL REFERENCES contacts(id),
  employee_id UUID NULL,
  participant_role TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_participants_deal ON finance_participants(finance_deal_id);

-- 3.4 Finance Payment Schedule
CREATE TABLE IF NOT EXISTS finance_payment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  principal_due NUMERIC DEFAULT 0,
  interest_due NUMERIC DEFAULT 0,
  total_due NUMERIC DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'PLANNED'
);

CREATE INDEX IF NOT EXISTS idx_finance_schedule_deal_date ON finance_payment_schedule(finance_deal_id, due_date);

-- 3.5 Finance Ledger (all money movements)
CREATE TABLE IF NOT EXISTS finance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  base_amount NUMERIC NOT NULL DEFAULT 0,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC NULL,
  allocation JSONB DEFAULT '{}'::jsonb,
  note TEXT NULL,
  created_by_employee_id UUID NULL,
  visibility_mode TEXT DEFAULT 'public' CHECK (visibility_mode IN ('public','restricted')),
  allowed_role_codes TEXT[] DEFAULT '{}'::text[],
  client_audience_notes JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_deal ON finance_ledger(finance_deal_id, occurred_at DESC);

-- 3.6 Finance Pause Periods
CREATE TABLE IF NOT EXISTS finance_pause_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NULL,
  created_by_employee_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_pause_deal ON finance_pause_periods(finance_deal_id);

-- 3.7 Finance Collateral Links
CREATE TABLE IF NOT EXISTS finance_collateral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_collateral_links_deal ON finance_collateral_links(finance_deal_id);
CREATE INDEX IF NOT EXISTS idx_collateral_links_asset ON finance_collateral_links(asset_id);

-- 3.8 Finance Collateral Chain (replacement history)
CREATE TABLE IF NOT EXISTS finance_collateral_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_deal_id UUID NOT NULL REFERENCES finance_deals(id) ON DELETE CASCADE,
  old_asset_id UUID NOT NULL REFERENCES assets(id),
  new_asset_id UUID NOT NULL REFERENCES assets(id),
  reason TEXT NULL,
  created_by_employee_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collateral_chain_deal ON finance_collateral_chain(finance_deal_id);

-- =========================================================
-- 4. EXCHANGE EXTENSIONS (add-only to existing tables)
-- =========================================================

-- 4.1 client_exchange_operations: add new columns
ALTER TABLE client_exchange_operations ADD COLUMN IF NOT EXISTS status_code TEXT NULL;
ALTER TABLE client_exchange_operations ADD COLUMN IF NOT EXISTS responsible_employee_id UUID NULL;
ALTER TABLE client_exchange_operations ADD COLUMN IF NOT EXISTS followup_at TIMESTAMPTZ NULL;
ALTER TABLE client_exchange_operations ADD COLUMN IF NOT EXISTS followup_note TEXT NULL;

-- 4.2 client_exchange_details: add handover + visibility
ALTER TABLE client_exchange_details ADD COLUMN IF NOT EXISTS handover_contact_id UUID NULL;
ALTER TABLE client_exchange_details ADD COLUMN IF NOT EXISTS handover_employee_id UUID NULL;
ALTER TABLE client_exchange_details ADD COLUMN IF NOT EXISTS visibility_mode TEXT DEFAULT 'public';
ALTER TABLE client_exchange_details ADD COLUMN IF NOT EXISTS allowed_role_codes TEXT[] DEFAULT '{}'::text[];
ALTER TABLE client_exchange_details ADD COLUMN IF NOT EXISTS client_audience_notes JSONB DEFAULT '{}'::jsonb;

-- 4.3 Exchange Statuses (configurable status catalog)
CREATE TABLE IF NOT EXISTS exchange_statuses (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);

-- Seed system statuses
INSERT INTO exchange_statuses (code, name, sort_order, is_system, is_active) VALUES
  ('pending', 'Ожидание', 10, true, true),
  ('completed', 'Завершена', 20, true, true),
  ('cancelled', 'Отменена', 30, true, true),
  ('quoted', 'Котировка', 5, false, true),
  ('awaiting_funds', 'Ожидание средств', 12, false, true),
  ('awaiting_liquidity', 'Ожидание ликвидности', 13, false, true),
  ('in_delivery', 'В доставке', 15, false, true),
  ('delivered', 'Доставлена', 17, false, true),
  ('confirmed', 'Подтверждена', 18, false, true),
  ('dispute', 'Спор', 25, false, true)
ON CONFLICT (code) DO NOTHING;

-- 4.4 Client Exchange Participants
CREATE TABLE IF NOT EXISTS client_exchange_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES client_exchange_operations(id) ON DELETE CASCADE,
  contact_id UUID NULL REFERENCES contacts(id),
  employee_id UUID NULL,
  role TEXT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_participants_op ON client_exchange_participants(operation_id);

-- =========================================================
-- 5. VIEWS FOR TIMELINES AND UNIFIED DEAL LIST
-- =========================================================

-- 5.1 v_timeline_finance_deal_events
CREATE OR REPLACE VIEW v_timeline_finance_deal_events AS
-- Money events from ledger
SELECT
  fl.occurred_at AS event_time,
  'money' AS lane,
  'finance' AS module,
  fl.entry_type AS event_type,
  fl.id AS entity_id,
  fl.finance_deal_id,
  fl.entry_type || ': ' || fl.amount || ' ' || fl.currency AS title,
  fl.amount,
  fl.currency,
  fl.base_amount,
  fl.visibility_mode,
  fl.allowed_role_codes,
  fl.client_audience_notes,
  fl.created_by_employee_id
FROM finance_ledger fl

UNION ALL

-- Pause events
SELECT
  fpp.created_at AS event_time,
  'money' AS lane,
  'finance' AS module,
  'pause' AS event_type,
  fpp.id AS entity_id,
  fpp.finance_deal_id,
  'Пауза: ' || fpp.start_date || ' — ' || fpp.end_date AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  NULL::numeric AS base_amount,
  'public' AS visibility_mode,
  '{}'::text[] AS allowed_role_codes,
  '{}'::jsonb AS client_audience_notes,
  fpp.created_by_employee_id
FROM finance_pause_periods fpp

UNION ALL

-- Collateral link events
SELECT
  fcl.started_at AS event_time,
  'assets' AS lane,
  'finance' AS module,
  'collateral_' || fcl.status AS event_type,
  fcl.id AS entity_id,
  fcl.finance_deal_id,
  'Залог: ' || a.title || ' (' || fcl.status || ')' AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  NULL::numeric AS base_amount,
  'public' AS visibility_mode,
  '{}'::text[] AS allowed_role_codes,
  '{}'::jsonb AS client_audience_notes,
  NULL::uuid AS created_by_employee_id
FROM finance_collateral_links fcl
JOIN assets a ON a.id = fcl.asset_id

UNION ALL

-- Collateral chain (replacement) events
SELECT
  fcc.created_at AS event_time,
  'assets' AS lane,
  'finance' AS module,
  'collateral_replace' AS event_type,
  fcc.id AS entity_id,
  fcc.finance_deal_id,
  'Замена залога: ' || a_old.title || ' -> ' || a_new.title AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  NULL::numeric AS base_amount,
  'public' AS visibility_mode,
  '{}'::text[] AS allowed_role_codes,
  '{}'::jsonb AS client_audience_notes,
  fcc.created_by_employee_id
FROM finance_collateral_chain fcc
JOIN assets a_old ON a_old.id = fcc.old_asset_id
JOIN assets a_new ON a_new.id = fcc.new_asset_id

UNION ALL

-- Asset sale events linked to finance deals
SELECT
  ase.sold_at AS event_time,
  'assets' AS lane,
  'finance' AS module,
  'asset_sale' AS event_type,
  ase.id AS entity_id,
  ase.related_finance_deal_id AS finance_deal_id,
  'Продажа актива: ' || a.title || ' за ' || ase.sale_amount || ' ' || ase.sale_currency AS title,
  ase.sale_amount AS amount,
  ase.sale_currency AS currency,
  ase.base_amount,
  ase.visibility_mode,
  ase.allowed_role_codes,
  ase.client_audience_notes,
  ase.created_by_employee_id
FROM asset_sale_events ase
JOIN assets a ON a.id = ase.asset_id
WHERE ase.related_finance_deal_id IS NOT NULL;

-- 5.2 v_timeline_asset_events
CREATE OR REPLACE VIEW v_timeline_asset_events AS
-- Location moves
SELECT
  alm.moved_at AS event_time,
  'move' AS event_type,
  alm.id AS entity_id,
  alm.asset_id,
  'Перемещение: ' || COALESCE(loc_from.name, '—') || ' -> ' || COALESCE(loc_to.name, '—') AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  alm.moved_by_employee_id AS created_by_employee_id
FROM asset_location_moves alm
LEFT JOIN asset_locations loc_from ON loc_from.id = alm.from_location_id
LEFT JOIN asset_locations loc_to ON loc_to.id = alm.to_location_id

UNION ALL

-- Valuations
SELECT
  av.created_at AS event_time,
  'valuation' AS event_type,
  av.id AS entity_id,
  av.asset_id,
  'Оценка: ' || av.valuation_amount || ' ' || av.valuation_currency AS title,
  av.valuation_amount AS amount,
  av.valuation_currency AS currency,
  av.created_by_employee_id
FROM asset_valuations av

UNION ALL

-- Collateral links
SELECT
  fcl.started_at AS event_time,
  'collateral_' || fcl.status AS event_type,
  fcl.id AS entity_id,
  fcl.asset_id,
  'Залог (' || fcl.status || ')' AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  NULL::uuid AS created_by_employee_id
FROM finance_collateral_links fcl

UNION ALL

-- Collateral chain
SELECT
  fcc.created_at AS event_time,
  'collateral_replace' AS event_type,
  fcc.id AS entity_id,
  fcc.old_asset_id AS asset_id,
  'Замена залога' AS title,
  NULL::numeric AS amount,
  NULL::text AS currency,
  fcc.created_by_employee_id
FROM finance_collateral_chain fcc

UNION ALL

-- Sale events
SELECT
  ase.sold_at AS event_time,
  'sale' AS event_type,
  ase.id AS entity_id,
  ase.asset_id,
  'Продажа: ' || ase.sale_amount || ' ' || ase.sale_currency AS title,
  ase.sale_amount AS amount,
  ase.sale_currency AS currency,
  ase.created_by_employee_id
FROM asset_sale_events ase;

-- 5.3 v_deals_unified (unified deals list with filter by kind)
CREATE OR REPLACE VIEW v_deals_unified AS
-- Legacy deals
SELECT
  'legacy_deals:' || d.id AS unified_id,
  'legacy_deals' AS source,
  d.id AS entity_id,
  'deals' AS kind,
  COALESCE(d.deal_number, d.client_name) AS title,
  d.status,
  d.contract_amount_usd AS amount,
  'USD' AS currency,
  d.contact_id,
  d.created_at
FROM deals d

UNION ALL

-- Auto deals
SELECT
  'auto_deals:' || ad.id AS unified_id,
  'auto_deals' AS source,
  ad.id AS entity_id,
  'auto' AS kind,
  ad.deal_number AS title,
  ad.status,
  ad.sale_price AS amount,
  ad.sale_currency AS currency,
  ad.buyer_contact_id AS contact_id,
  ad.created_at
FROM auto_deals ad

UNION ALL

-- Finance deals
SELECT
  'finance:' || fd.id AS unified_id,
  'finance' AS source,
  fd.id AS entity_id,
  'finance' AS kind,
  cd.title,
  cd.status,
  fd.principal_amount AS amount,
  fd.contract_currency AS currency,
  cd.contact_id,
  cd.created_at
FROM finance_deals fd
JOIN core_deals cd ON cd.id = fd.core_deal_id;

-- =========================================================
-- 6. RBAC: NEW PRESET ROLES FOR ASSETS & FINANCE
-- =========================================================

-- ASSETS module roles
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('ASSETS_VIEW', 'Имущество: Просмотр', 'Просмотр имущества и залогов', 'assets',
   ARRAY['assets.read', 'contacts.segment.deals.read'], true),
  ('ASSETS_WORK', 'Имущество: Работа', 'Работа с имуществом', 'assets',
   ARRAY['assets.read', 'assets.write', 'contacts.segment.deals.read'], true),
  ('ASSETS_MANAGE', 'Имущество: Управление', 'Полное управление имуществом', 'assets',
   ARRAY['assets.read', 'assets.write', 'assets.manage', 'contacts.segment.deals.read', 'contacts.segment.deals.write'], true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;

-- FINANCE module roles
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('FINANCE_VIEW', 'Финансовые сделки: Просмотр', 'Просмотр финансовых сделок', 'finance',
   ARRAY['finance.read', 'deals.read', 'contacts.segment.deals.read'], true),
  ('FINANCE_WORK', 'Финансовые сделки: Работа', 'Работа с финансовыми сделками', 'finance',
   ARRAY['finance.read', 'finance.write', 'deals.read', 'contacts.segment.deals.read', 'contacts.segment.deals.write'], true),
  ('FINANCE_MANAGE', 'Финансовые сделки: Управление', 'Полное управление финансовыми сделками', 'finance',
   ARRAY['finance.read', 'finance.write', 'finance.manage', 'deals.read', 'deals.write', 'contacts.segment.deals.read', 'contacts.segment.deals.write'], true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;
