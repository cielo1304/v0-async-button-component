-- =============================================
-- Exchange Core Schema (Variant C)
-- =============================================
-- This migration creates the foundational schema for Exchange module:
-- 1. exchange_deals table for tracking exchange transactions
-- 2. exchange_legs table for tracking individual currency movements (out/in)
-- 3. Indexes for optimal query performance
-- 4. RLS policies for data isolation

-- =============================================
-- STEP 1: Create exchange_deals table
-- =============================================

CREATE TABLE IF NOT EXISTS exchange_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  comment TEXT NULL
);

-- Add status constraint
ALTER TABLE exchange_deals DROP CONSTRAINT IF EXISTS exchange_deals_status_check;
ALTER TABLE exchange_deals ADD CONSTRAINT exchange_deals_status_check 
  CHECK (status IN ('draft', 'completed', 'cancelled'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exchange_deals_company_id ON exchange_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_exchange_deals_company_deal_date ON exchange_deals(company_id, deal_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_deals_status ON exchange_deals(status);
CREATE INDEX IF NOT EXISTS idx_exchange_deals_created_at ON exchange_deals(created_at DESC);

-- RLS policies
ALTER TABLE exchange_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on exchange_deals for authenticated users"
  ON exchange_deals FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- STEP 2: Create exchange_legs table
-- =============================================

CREATE TABLE IF NOT EXISTS exchange_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  deal_id UUID NOT NULL REFERENCES exchange_deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Direction and asset info
  direction TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  
  -- Optional fields
  cashbox_id UUID NULL,
  rate NUMERIC(20, 8) NULL,
  fee NUMERIC(20, 8) NULL
);

-- Add direction constraint
ALTER TABLE exchange_legs DROP CONSTRAINT IF EXISTS exchange_legs_direction_check;
ALTER TABLE exchange_legs ADD CONSTRAINT exchange_legs_direction_check 
  CHECK (direction IN ('out', 'in'));

-- Add asset_kind constraint
ALTER TABLE exchange_legs DROP CONSTRAINT IF EXISTS exchange_legs_asset_kind_check;
ALTER TABLE exchange_legs ADD CONSTRAINT exchange_legs_asset_kind_check 
  CHECK (asset_kind IN ('fiat', 'crypto', 'gold', 'other'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exchange_legs_company_id ON exchange_legs(company_id);
CREATE INDEX IF NOT EXISTS idx_exchange_legs_deal_id ON exchange_legs(deal_id);
CREATE INDEX IF NOT EXISTS idx_exchange_legs_direction ON exchange_legs(direction);
CREATE INDEX IF NOT EXISTS idx_exchange_legs_asset_code ON exchange_legs(asset_code);
CREATE INDEX IF NOT EXISTS idx_exchange_legs_cashbox_id ON exchange_legs(cashbox_id) WHERE cashbox_id IS NOT NULL;

-- RLS policies
ALTER TABLE exchange_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on exchange_legs for authenticated users"
  ON exchange_legs FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- Comments
-- =============================================

COMMENT ON TABLE exchange_deals IS 'Exchange deals tracking - parent record for exchange transactions';
COMMENT ON TABLE exchange_legs IS 'Exchange legs - individual currency movements (out/in) for each deal';
COMMENT ON COLUMN exchange_legs.direction IS 'Direction of currency movement: out (from client) or in (to client)';
COMMENT ON COLUMN exchange_legs.asset_kind IS 'Type of asset: fiat, crypto, gold, or other';
COMMENT ON COLUMN exchange_legs.asset_code IS 'Currency/asset code (e.g., RUB, USD, BTC, XAU)';
COMMENT ON COLUMN exchange_legs.amount IS 'Amount of currency/asset (always positive)';
COMMENT ON COLUMN exchange_legs.cashbox_id IS 'Optional: linked cashbox for this leg';
COMMENT ON COLUMN exchange_legs.rate IS 'Optional: exchange rate used';
COMMENT ON COLUMN exchange_legs.fee IS 'Optional: fee/commission charged';
