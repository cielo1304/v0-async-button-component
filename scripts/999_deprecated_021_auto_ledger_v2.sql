-- Auto Ledger Table (Ultra Minimal)

CREATE TABLE IF NOT EXISTS auto_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL,
  deal_id UUID,
  category TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);
