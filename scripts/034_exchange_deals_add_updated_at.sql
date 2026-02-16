-- =====================================================================
-- Migration: 034_exchange_deals_add_updated_at.sql
-- Description: Add updated_at column to exchange_deals to prevent 
--              crashes in script 033 when updating deal status
-- =====================================================================

-- Add updated_at column if not exists
ALTER TABLE exchange_deals
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Create trigger function to auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_exchange_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_exchange_deals_updated_at ON exchange_deals;

CREATE TRIGGER trigger_exchange_deals_updated_at
  BEFORE UPDATE ON exchange_deals
  FOR EACH ROW
  EXECUTE FUNCTION update_exchange_deals_updated_at();

-- Backfill updated_at for existing records to match created_at
UPDATE exchange_deals
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at = created_at;

COMMENT ON COLUMN exchange_deals.updated_at IS 'Timestamp of last update, automatically maintained by trigger';
COMMENT ON TRIGGER trigger_exchange_deals_updated_at ON exchange_deals IS 'Auto-updates updated_at column on every UPDATE';
