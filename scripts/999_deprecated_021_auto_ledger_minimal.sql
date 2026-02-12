-- Auto Ledger Table (Minimal Version)

CREATE TABLE IF NOT EXISTS auto_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES auto_deals(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_auto_ledger_car_id ON auto_ledger(car_id);
CREATE INDEX IF NOT EXISTS idx_auto_ledger_deal_id ON auto_ledger(deal_id);

ALTER TABLE auto_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on auto_ledger"
  ON auto_ledger FOR ALL
  USING (true)
  WITH CHECK (true);
