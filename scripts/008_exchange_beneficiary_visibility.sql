-- 1. Add beneficiary / handover / visibility / rates_snapshot to operations
ALTER TABLE client_exchange_operations
  ADD COLUMN IF NOT EXISTS beneficiary_contact_id UUID REFERENCES contacts(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS handover_contact_id UUID REFERENCES contacts(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allowed_role_codes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rates_snapshot JSONB DEFAULT NULL;
