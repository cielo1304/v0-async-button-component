-- core_deals: add visibility_mode + allowed_role_codes
ALTER TABLE core_deals
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allowed_role_codes TEXT[] NOT NULL DEFAULT '{}';

-- finance_deals: add visibility_mode + allowed_role_codes + client_audience_notes
ALTER TABLE finance_deals
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allowed_role_codes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS client_audience_notes JSONB NOT NULL DEFAULT '{}';

-- client_exchange_operations: add client_audience_notes
ALTER TABLE client_exchange_operations
  ADD COLUMN IF NOT EXISTS client_audience_notes JSONB NOT NULL DEFAULT '{}';
