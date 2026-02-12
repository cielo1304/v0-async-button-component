-- Migration 018: Currency Rate History
-- Purpose: Store historical currency rates for 24h change calculations
-- Date: 2024-01-15

-- Create currency_rate_history table
CREATE TABLE IF NOT EXISTS currency_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  rate_to_rub numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_currency_rate_history_code_recorded 
  ON currency_rate_history(code, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_currency_rate_history_recorded 
  ON currency_rate_history(recorded_at DESC);

-- Add table comment
COMMENT ON TABLE currency_rate_history IS 
  'Historical currency rates for tracking 24h changes and trends. Populated by currency rate refresh operations.';

COMMENT ON COLUMN currency_rate_history.code IS 'Currency code (USD, EUR, etc.)';
COMMENT ON COLUMN currency_rate_history.rate_to_rub IS 'Exchange rate to RUB at the time of recording';
COMMENT ON COLUMN currency_rate_history.recorded_at IS 'Timestamp when the rate was recorded';
