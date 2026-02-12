-- =============================================
-- 022: Auto Schema Alignment V2
-- Purpose: Align auto_clients, auto_deals, auto_payments with UI/types
-- =============================================

-- =============================================
-- PART 1: auto_clients - add contact_id reference
-- =============================================

ALTER TABLE auto_clients
ADD COLUMN IF NOT EXISTS contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auto_clients_contact_id ON auto_clients(contact_id);

-- =============================================
-- PART 2: auto_deals - add missing columns
-- =============================================

-- Contact references
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS buyer_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS seller_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

-- Sale fields
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS sale_price NUMERIC NULL;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'RUB';

-- Payment tracking
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS total_paid NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS total_debt NUMERIC NOT NULL DEFAULT 0;

-- Rent fields
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS rent_price_daily NUMERIC NULL;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS rent_start_date DATE NULL;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS rent_end_date DATE NULL;

-- Commission fields
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS commission_mode TEXT NULL;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS commission_fixed_amount NUMERIC NULL;

-- Profit tracking
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS profit_total NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS profit_available NUMERIC NOT NULL DEFAULT 0;

-- Rules JSONB
ALTER TABLE auto_deals
ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_deals_car_id ON auto_deals(car_id);
CREATE INDEX IF NOT EXISTS idx_auto_deals_buyer_contact_id ON auto_deals(buyer_contact_id);
CREATE INDEX IF NOT EXISTS idx_auto_deals_seller_contact_id ON auto_deals(seller_contact_id);

-- =============================================
-- PART 3: auto_deals - update constraints for UI compatibility
-- =============================================

-- Drop old deal_type constraint if exists
ALTER TABLE auto_deals DROP CONSTRAINT IF EXISTS auto_deals_deal_type_check;

-- Add new deal_type constraint (support RENT and RENTAL)
ALTER TABLE auto_deals ADD CONSTRAINT auto_deals_deal_type_check
  CHECK (deal_type IN ('CASH_SALE', 'COMMISSION_SALE', 'INSTALLMENT', 'RENTAL', 'RENT'));

-- Drop old status constraint if exists
ALTER TABLE auto_deals DROP CONSTRAINT IF EXISTS auto_deals_status_check;

-- Add new status constraint (support UI statuses)
ALTER TABLE auto_deals ADD CONSTRAINT auto_deals_status_check
  CHECK (status IN ('NEW', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'CANCELLED', 'OVERDUE'));

-- =============================================
-- PART 4: auto_payments - add missing columns
-- =============================================

ALTER TABLE auto_payments
ADD COLUMN IF NOT EXISTS due_date DATE NULL;

ALTER TABLE auto_payments
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE auto_payments
ADD COLUMN IF NOT EXISTS paid_date DATE NULL;

ALTER TABLE auto_payments
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID NULL;

-- Drop old status constraint if exists
ALTER TABLE auto_payments DROP CONSTRAINT IF EXISTS auto_payments_status_check;

-- Add new status constraint (support PARTIAL)
ALTER TABLE auto_payments ADD CONSTRAINT auto_payments_status_check
  CHECK (status IN ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_payments_deal_id_payment_number ON auto_payments(deal_id, payment_number);
CREATE INDEX IF NOT EXISTS idx_auto_payments_deal_id_due_date ON auto_payments(deal_id, due_date);
CREATE INDEX IF NOT EXISTS idx_auto_payments_status ON auto_payments(status);

-- =============================================
-- PART 5: Update existing data defaults
-- =============================================

-- Set total_debt = total_amount - paid_amount for existing deals
UPDATE auto_deals
SET total_paid = COALESCE(paid_amount, 0),
    total_debt = GREATEST(0, COALESCE(total_amount, 0) - COALESCE(paid_amount, 0))
WHERE total_paid = 0 AND total_debt = 0;

COMMENT ON TABLE auto_deals IS 'Auto deals with full UI field compatibility and payment tracking';
COMMENT ON TABLE auto_payments IS 'Auto payments with partial payment support and cashbox integration';
