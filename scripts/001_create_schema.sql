-- ================================================================
-- MUTK@ v3.0 - Полная схема базы данных
-- ================================================================

-- ================================================================
-- СЕКТОР 1: ФИНАНСЫ
-- ================================================================

-- КОШЕЛЬКИ (CASHBOXES)
CREATE TABLE IF NOT EXISTS cashboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK', 'CRYPTO', 'TRADE_IN')),
  currency TEXT NOT NULL CHECK (currency IN ('RUB', 'USD', 'USDT', 'EUR')),
  balance NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  initial_balance NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  is_hidden BOOLEAN DEFAULT false NOT NULL,
  is_archived BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ГЛАВНЫЙ ЖУРНАЛ ТРАНЗАКЦИЙ
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashbox_id UUID NOT NULL REFERENCES cashboxes(id) ON DELETE RESTRICT,
  amount NUMERIC(15, 2) NOT NULL,
  balance_after NUMERIC(15, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'DEPOSIT', 'WITHDRAW', 'DEAL_PAYMENT', 'EXPENSE', 
    'SALARY', 'EXCHANGE_OUT', 'EXCHANGE_IN', 
    'TRANSFER_OUT', 'TRANSFER_IN'
  )),
  description TEXT,
  deal_id UUID,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID NOT NULL
);

-- ИСТОРИЯ ОБМЕНОВ
CREATE TABLE IF NOT EXISTS exchange_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_box_id UUID NOT NULL REFERENCES cashboxes(id) ON DELETE RESTRICT,
  to_box_id UUID NOT NULL REFERENCES cashboxes(id) ON DELETE RESTRICT,
  sent_amount NUMERIC(15, 2) NOT NULL,
  sent_currency TEXT NOT NULL,
  received_amount NUMERIC(15, 2) NOT NULL,
  received_currency TEXT NOT NULL,
  rate NUMERIC(10, 4) NOT NULL,
  fee_amount NUMERIC(15, 2) DEFAULT 0,
  fee_currency TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID NOT NULL
);

-- КУРСЫ ВАЛЮТ
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(10, 4) NOT NULL,
  source TEXT NOT NULL,
  valid_from TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ================================================================
-- СЕКТОР 2: АКТИВЫ (АВТОМОБИЛИ)
-- ================================================================

-- АВТОМОБИЛИ
CREATE TABLE IF NOT EXISTS cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin TEXT UNIQUE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 1990 AND year <= EXTRACT(YEAR FROM now()) + 1),
  status TEXT NOT NULL DEFAULT 'stock' CHECK (status IN ('stock', 'sold', 'preparing', 'reserved', 'inspection', 'auction')),
  plate_number TEXT,
  
  buy_price NUMERIC(15, 2),
  buy_currency TEXT DEFAULT 'USD',
  buy_rate NUMERIC(10, 4),
  buy_price_usd NUMERIC(15, 2) GENERATED ALWAYS AS (COALESCE(buy_price / NULLIF(buy_rate, 0), buy_price)) STORED,
  
  total_cost NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  sell_price NUMERIC(15, 2),
  margin_percent NUMERIC(5, 2) GENERATED ALWAYS AS (
    CASE WHEN total_cost > 0 THEN ((COALESCE(sell_price, 0) - total_cost) / total_cost * 100)
    ELSE NULL END
  ) STORED,
  
  drom_specs JSONB DEFAULT '{}'::jsonb,
  color TEXT,
  engine_volume NUMERIC(3, 1),
  horsepower INTEGER,
  mileage INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ИСТОРИЯ ЖИЗНИ АВТОМОБИЛЯ
CREATE TABLE IF NOT EXISTS car_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PURCHASE', 'EXPENSE', 'STATUS_CHANGE', 'PRICE_CHANGE',
    'INSPECTION', 'REPAIR_START', 'REPAIR_END', 'RESERVED', 'SOLD'
  )),
  title TEXT NOT NULL,
  description TEXT,
  cost_impact NUMERIC(15, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID
);

-- ================================================================
-- СЕКТОР 3: СКЛАД
-- ================================================================

-- ТОВАРЫ НА СКЛАДЕ
CREATE TABLE IF NOT EXISTS stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('OIL', 'FILTER', 'TIRE', 'BRAKE', 'BODY', 'ELECTRIC', 'OTHER')),
  quantity INTEGER DEFAULT 0 NOT NULL CHECK (quantity >= 0),
  reserved_quantity INTEGER DEFAULT 0 NOT NULL CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
  available_quantity INTEGER GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
  avg_buy_price NUMERIC(15, 2) DEFAULT 0,
  last_buy_price NUMERIC(15, 2),
  currency TEXT DEFAULT 'RUB',
  min_threshold INTEGER DEFAULT 5,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ПАРТИИ ТОВАРА
CREATE TABLE IF NOT EXISTS stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  buy_price NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL,
  purchase_date DATE DEFAULT CURRENT_DATE,
  supplier TEXT,
  invoice_number TEXT,
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ================================================================
-- СЕКТОР 4: СДЕЛКИ
-- ================================================================

-- СДЕЛКИ
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('SALE', 'TRADE_IN', 'LOAN', 'PARTNER')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_passport TEXT,
  
  car_id UUID,
  
  contract_currency TEXT NOT NULL DEFAULT 'USD',
  contract_amount NUMERIC(15, 2) NOT NULL CHECK (contract_amount > 0),
  contract_amount_usd NUMERIC(15, 2) NOT NULL,
  
  paid_amount_usd NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  debt_amount_usd NUMERIC(15, 2) GENERATED ALWAYS AS (contract_amount_usd - paid_amount_usd) STORED,
  
  manager_id UUID NOT NULL,
  
  signed_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ПЛАТЕЖИ ПО СДЕЛКЕ
CREATE TABLE IF NOT EXISTS deal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  cashbox_id UUID REFERENCES cashboxes(id) ON DELETE SET NULL,
  
  amount_native NUMERIC(15, 2) NOT NULL,
  currency_native TEXT NOT NULL,
  rate NUMERIC(10, 4) NOT NULL,
  amount_usd NUMERIC(15, 2) NOT NULL,
  
  is_trade_in BOOLEAN DEFAULT false NOT NULL,
  trade_in_car_id UUID,
  
  transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID NOT NULL
);

-- ДОКУМЕНТЫ СДЕЛКИ
CREATE TABLE IF NOT EXISTS deal_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('IOU', 'CONTRACT', 'PASSPORT', 'PTS', 'DCP', 'OTHER')),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ================================================================
-- СЕКТОР 5: HR И ЗАРПЛАТЫ
-- ================================================================

-- БАЛАНСЫ СОТРУДНИКОВ
CREATE TABLE IF NOT EXISTS salary_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  total_earned NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  total_paid NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  last_calculated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ТРАНЗАКЦИИ ЗАРПЛАТ
CREATE TABLE IF NOT EXISTS salary_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BONUS', 'SALARY', 'ADVANCE', 'FINE', 'CORRECTION')),
  amount NUMERIC(15, 2) NOT NULL,
  description TEXT NOT NULL,
  deal_id UUID,
  cashbox_id UUID REFERENCES cashboxes(id) ON DELETE SET NULL,
  transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID
);

-- ================================================================
-- СЕКТОР 6: АУДИТ
-- ================================================================

-- АУДИТ-ЛОГ
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ================================================================
-- ИНДЕКСЫ (КРИТИЧЕСКИ ВАЖНЫЕ)
-- ================================================================

-- Cashboxes
CREATE INDEX IF NOT EXISTS idx_cashboxes_currency ON cashboxes(currency);
CREATE INDEX IF NOT EXISTS idx_cashboxes_is_hidden ON cashboxes(is_hidden) WHERE is_hidden = false;

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_cashbox_id ON transactions(cashbox_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_deal_id ON transactions(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

-- Cars
CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
CREATE INDEX IF NOT EXISTS idx_cars_vin ON cars(vin);
CREATE INDEX IF NOT EXISTS idx_cars_make_model ON cars(make, model);
CREATE INDEX IF NOT EXISTS idx_cars_total_cost ON cars(total_cost);

-- Car Timeline
CREATE INDEX IF NOT EXISTS idx_car_timeline_car_id ON car_timeline(car_id);
CREATE INDEX IF NOT EXISTS idx_car_timeline_created_at ON car_timeline(created_at DESC);

-- Stock
CREATE INDEX IF NOT EXISTS idx_stock_items_category ON stock_items(category);
CREATE INDEX IF NOT EXISTS idx_stock_items_available ON stock_items(available_quantity) WHERE available_quantity > 0;

-- Deals
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_manager_id ON deals(manager_id);
CREATE INDEX IF NOT EXISTS idx_deals_client_phone ON deals(client_phone);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC);

-- Deal Payments
CREATE INDEX IF NOT EXISTS idx_deal_payments_deal_id ON deal_payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_payments_created_at ON deal_payments(created_at DESC);

-- Exchange Logs
CREATE INDEX IF NOT EXISTS idx_exchange_logs_created_at ON exchange_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_logs_from_box ON exchange_logs(from_box_id);

-- Salary
CREATE INDEX IF NOT EXISTS idx_salary_transactions_user_id ON salary_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_transactions_created_at ON salary_transactions(created_at DESC);

-- ================================================================
-- ТРИГГЕРЫ (AUTO-UPDATE updated_at)
-- ================================================================

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Применяем к нужным таблицам
DROP TRIGGER IF EXISTS update_cashboxes_updated_at ON cashboxes;
CREATE TRIGGER update_cashboxes_updated_at 
  BEFORE UPDATE ON cashboxes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cars_updated_at ON cars;
CREATE TRIGGER update_cars_updated_at 
  BEFORE UPDATE ON cars 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_items_updated_at ON stock_items;
CREATE TRIGGER update_stock_items_updated_at 
  BEFORE UPDATE ON stock_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
CREATE TRIGGER update_deals_updated_at 
  BEFORE UPDATE ON deals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_salary_balances_updated_at ON salary_balances;
CREATE TRIGGER update_salary_balances_updated_at 
  BEFORE UPDATE ON salary_balances 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- SEED DATA (тестовые данные)
-- ================================================================

-- Кассы по умолчанию
INSERT INTO cashboxes (name, type, currency, balance, initial_balance) VALUES
  ('Касса RUB', 'CASH', 'RUB', 100000.00, 100000.00),
  ('Касса USD', 'CASH', 'USD', 5000.00, 5000.00),
  ('Банк USD', 'BANK', 'USD', 50000.00, 50000.00),
  ('Trade-In резерв', 'TRADE_IN', 'USD', 0.00, 0.00)
ON CONFLICT DO NOTHING;

-- Начальные курсы валют
INSERT INTO currency_rates (from_currency, to_currency, rate, source) VALUES
  ('RUB', 'USD', 0.0105, 'manual'),
  ('USD', 'RUB', 95.24, 'manual'),
  ('USD', 'USDT', 1.0, 'manual'),
  ('USDT', 'USD', 1.0, 'manual')
ON CONFLICT DO NOTHING;
