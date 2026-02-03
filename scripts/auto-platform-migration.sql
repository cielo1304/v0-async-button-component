-- =====================================================
-- МИГРАЦИЯ: Модуль "Автоплощадка"
-- Новые таблицы для комиссионных продаж, рассрочки, аренды
-- =====================================================

-- 1. Клиенты автоплощадки (отдельно от клиентов сделок обмена)
CREATE TABLE IF NOT EXISTS auto_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Основные данные
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  
  -- Паспортные данные
  passport_series VARCHAR(10),
  passport_number VARCHAR(20),
  passport_issued_by TEXT,
  passport_issued_date DATE,
  
  -- Адрес
  address TEXT,
  
  -- Водительское удостоверение
  driver_license VARCHAR(50),
  driver_license_date DATE,
  
  -- Тип клиента
  client_type VARCHAR(20) DEFAULT 'BUYER' CHECK (client_type IN ('BUYER', 'SELLER', 'RENTER', 'CONSIGNOR')),
  
  -- Рейтинг и статус
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  is_blacklisted BOOLEAN DEFAULT FALSE,
  blacklist_reason TEXT,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Сделки автоплощадки (продажи, комиссия, рассрочка, аренда)
CREATE TABLE IF NOT EXISTS auto_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Номер сделки
  deal_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Тип сделки
  deal_type VARCHAR(30) NOT NULL CHECK (deal_type IN (
    'CASH_SALE',        -- Наличная продажа (своё авто)
    'COMMISSION_SALE',  -- Комиссионная продажа (чужое авто)
    'INSTALLMENT',      -- Рассрочка
    'RENTAL'            -- Аренда
  )),
  
  -- Статус сделки
  status VARCHAR(30) DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT',            -- Черновик
    'ACTIVE',           -- Активная
    'PENDING_PAYMENT',  -- Ожидает оплаты
    'PARTIALLY_PAID',   -- Частично оплачена
    'PAID',             -- Полностью оплачена
    'OVERDUE',          -- Просрочена
    'COMPLETED',        -- Завершена
    'CANCELLED'         -- Отменена
  )),
  
  -- Связи
  car_id UUID REFERENCES cars(id),
  buyer_id UUID REFERENCES auto_clients(id),      -- Покупатель/Арендатор
  seller_id UUID REFERENCES auto_clients(id),     -- Продавец (для комиссии)
  
  -- Финансы
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,  -- Общая сумма сделки
  currency VARCHAR(10) DEFAULT 'RUB',
  
  -- Для комиссионных продаж
  commission_percent DECIMAL(5,2),                -- Процент комиссии
  commission_amount DECIMAL(15,2),                -- Сумма комиссии
  seller_amount DECIMAL(15,2),                    -- Сумма продавцу
  
  -- Для рассрочки
  down_payment DECIMAL(15,2),                     -- Первоначальный взнос
  installment_months INTEGER,                     -- Срок рассрочки в месяцах
  monthly_payment DECIMAL(15,2),                  -- Ежемесячный платёж
  interest_rate DECIMAL(5,2) DEFAULT 0,           -- Процентная ставка
  
  -- Для аренды
  rental_start_date DATE,
  rental_end_date DATE,
  daily_rate DECIMAL(15,2),                       -- Стоимость в день
  deposit_amount DECIMAL(15,2),                   -- Залог
  mileage_limit INTEGER,                          -- Лимит пробега
  mileage_overage_rate DECIMAL(10,2),             -- Стоимость за превышение км
  
  -- Оплачено
  paid_amount DECIMAL(15,2) DEFAULT 0,
  
  -- Прибыль
  profit_amount DECIMAL(15,2) DEFAULT 0,
  
  -- Даты
  contract_date DATE,
  completed_at TIMESTAMPTZ,
  
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Платежи по сделкам автоплощадки
CREATE TABLE IF NOT EXISTS auto_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  deal_id UUID NOT NULL REFERENCES auto_deals(id) ON DELETE CASCADE,
  
  -- Тип платежа
  payment_type VARCHAR(30) NOT NULL CHECK (payment_type IN (
    'DOWN_PAYMENT',     -- Первоначальный взнос
    'INSTALLMENT',      -- Платёж по рассрочке
    'RENTAL',           -- Арендный платёж
    'DEPOSIT',          -- Залог
    'DEPOSIT_RETURN',   -- Возврат залога
    'COMMISSION',       -- Комиссия
    'TO_SELLER',        -- Выплата продавцу
    'PENALTY',          -- Штраф
    'OTHER'             -- Прочее
  )),
  
  -- Сумма
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'RUB',
  
  -- Направление
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  
  -- Касса
  cashbox_id UUID REFERENCES cashboxes(id),
  transaction_id UUID REFERENCES transactions(id),
  
  -- График (для рассрочки/аренды)
  scheduled_date DATE,                            -- Плановая дата
  paid_date DATE,                                 -- Фактическая дата оплаты
  payment_number INTEGER,                         -- Номер платежа в графике
  
  -- Статус
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',          -- Ожидает
    'PAID',             -- Оплачен
    'OVERDUE',          -- Просрочен
    'CANCELLED'         -- Отменён
  )),
  
  -- Просрочка
  days_overdue INTEGER DEFAULT 0,
  penalty_amount DECIMAL(15,2) DEFAULT 0,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Штрафы и пени
CREATE TABLE IF NOT EXISTS auto_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  deal_id UUID NOT NULL REFERENCES auto_deals(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES auto_payments(id),
  
  -- Тип штрафа
  penalty_type VARCHAR(30) NOT NULL CHECK (penalty_type IN (
    'LATE_PAYMENT',     -- Просрочка платежа
    'MILEAGE_OVERAGE',  -- Превышение пробега
    'DAMAGE',           -- Повреждение
    'EARLY_RETURN',     -- Досрочный возврат
    'LATE_RETURN',      -- Поздний возврат
    'OTHER'             -- Прочее
  )),
  
  -- Сумма
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'RUB',
  
  -- Расчёт
  days_overdue INTEGER,                           -- Дней просрочки
  rate_per_day DECIMAL(10,2),                     -- Ставка за день
  
  -- Статус
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'PAID',
    'WAIVED',           -- Списан
    'CANCELLED'
  )),
  
  -- Оплата
  paid_date DATE,
  cashbox_id UUID REFERENCES cashboxes(id),
  transaction_id UUID REFERENCES transactions(id),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. История автомобилей на площадке
CREATE TABLE IF NOT EXISTS auto_car_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES auto_deals(id),
  
  -- Тип события
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'RECEIVED',         -- Принят на площадку
    'INSPECTION',       -- Осмотр
    'PRICE_CHANGE',     -- Изменение цены
    'RESERVED',         -- Зарезервирован
    'SOLD',             -- Продан
    'RENTED',           -- Сдан в аренду
    'RETURNED',         -- Возвращён
    'WITHDRAWN'         -- Снят с продажи
  )),
  
  -- Детали
  old_value TEXT,
  new_value TEXT,
  
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Добавляем поля в таблицу cars для площадки
DO $$ 
BEGIN
  -- Источник авто (свой/комиссия)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'source_type') THEN
    ALTER TABLE cars ADD COLUMN source_type VARCHAR(20) DEFAULT 'OWN' CHECK (source_type IN ('OWN', 'COMMISSION'));
  END IF;
  
  -- Владелец (для комиссии)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'owner_client_id') THEN
    ALTER TABLE cars ADD COLUMN owner_client_id UUID REFERENCES auto_clients(id);
  END IF;
  
  -- Условия комиссии
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'commission_percent') THEN
    ALTER TABLE cars ADD COLUMN commission_percent DECIMAL(5,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'min_sale_price') THEN
    ALTER TABLE cars ADD COLUMN min_sale_price DECIMAL(15,2);
  END IF;
  
  -- Доступность для аренды
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'available_for_rent') THEN
    ALTER TABLE cars ADD COLUMN available_for_rent BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'daily_rental_rate') THEN
    ALTER TABLE cars ADD COLUMN daily_rental_rate DECIMAL(15,2);
  END IF;
  
  -- Текущий пробег
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cars' AND column_name = 'current_mileage') THEN
    ALTER TABLE cars ADD COLUMN current_mileage INTEGER;
  END IF;
END $$;

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_auto_clients_phone ON auto_clients(phone);
CREATE INDEX IF NOT EXISTS idx_auto_clients_type ON auto_clients(client_type);
CREATE INDEX IF NOT EXISTS idx_auto_deals_type ON auto_deals(deal_type);
CREATE INDEX IF NOT EXISTS idx_auto_deals_status ON auto_deals(status);
CREATE INDEX IF NOT EXISTS idx_auto_deals_car ON auto_deals(car_id);
CREATE INDEX IF NOT EXISTS idx_auto_deals_buyer ON auto_deals(buyer_id);
CREATE INDEX IF NOT EXISTS idx_auto_payments_deal ON auto_payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_auto_payments_scheduled ON auto_payments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_auto_payments_status ON auto_payments(status);
CREATE INDEX IF NOT EXISTS idx_auto_penalties_deal ON auto_penalties(deal_id);
CREATE INDEX IF NOT EXISTS idx_auto_car_history_car ON auto_car_history(car_id);

-- Функция обновления updated_at
CREATE OR REPLACE FUNCTION update_auto_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры
DROP TRIGGER IF EXISTS auto_clients_updated_at ON auto_clients;
CREATE TRIGGER auto_clients_updated_at
  BEFORE UPDATE ON auto_clients
  FOR EACH ROW EXECUTE FUNCTION update_auto_updated_at();

DROP TRIGGER IF EXISTS auto_deals_updated_at ON auto_deals;
CREATE TRIGGER auto_deals_updated_at
  BEFORE UPDATE ON auto_deals
  FOR EACH ROW EXECUTE FUNCTION update_auto_updated_at();

-- Комментарии к таблицам
COMMENT ON TABLE auto_clients IS 'Клиенты автоплощадки (покупатели, продавцы, арендаторы)';
COMMENT ON TABLE auto_deals IS 'Сделки автоплощадки (продажи, комиссия, рассрочка, аренда)';
COMMENT ON TABLE auto_payments IS 'Платежи по сделкам автоплощадки с графиком';
COMMENT ON TABLE auto_penalties IS 'Штрафы и пени по сделкам';
COMMENT ON TABLE auto_car_history IS 'История событий автомобилей на площадке';
