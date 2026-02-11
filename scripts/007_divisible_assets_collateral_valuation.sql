-- 1. Add divisible asset fields to assets
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS is_divisible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_units NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_units NUMERIC DEFAULT NULL;

-- 2. Add valuation / LTV snapshot to collateral links
ALTER TABLE finance_collateral_links
  ADD COLUMN IF NOT EXISTS pledged_units NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS valuation_at_pledge NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ltv_at_pledge NUMERIC DEFAULT NULL;
