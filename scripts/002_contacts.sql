-- =========================================================
-- Миграция: Модуль "Контакты" - ядро клиента для 3 направлений
-- Файл: scripts/002_contacts.sql
-- =========================================================

-- =====================
-- 1. ОСНОВНЫЕ ТАБЛИЦЫ
-- =====================

-- Контакты (ядро)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Каналы связи (телефон, email)
CREATE TABLE IF NOT EXISTS contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('phone', 'email')),
  value TEXT NOT NULL,
  normalized TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(type, normalized)
);

-- Сегменты (привязка к модулям: exchange, deals, auto)
CREATE TABLE IF NOT EXISTS contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('exchange', 'deals', 'auto')),
  metadata JSONB DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, module)
);

-- Чувствительные данные (паспорт, права)
CREATE TABLE IF NOT EXISTS contact_sensitive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  passport_series TEXT NULL,
  passport_number TEXT NULL,
  passport_issued_by TEXT NULL,
  passport_issued_date DATE NULL,
  address TEXT NULL,
  driver_license TEXT NULL,
  driver_license_date DATE NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id)
);

-- События контакта (таймлайн)
CREATE TABLE IF NOT EXISTS contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('exchange', 'deals', 'auto')),
  entity_type TEXT NOT NULL,
  entity_id UUID NULL,
  title TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 2. ИНДЕКСЫ
-- =====================

CREATE INDEX IF NOT EXISTS idx_contact_channels_type_normalized ON contact_channels(type, normalized);
CREATE INDEX IF NOT EXISTS idx_contact_segments_module_activity ON contact_segments(module, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_events_contact_happened ON contact_events(contact_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_events_module_happened ON contact_events(module, happened_at DESC);

-- =====================
-- 3. АДДИТИВНЫЕ КОЛОНКИ В СУЩЕСТВУЮЩИЕ ТАБЛИЦЫ
-- =====================

-- deals: добавляем contact_id
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deals' AND column_name = 'contact_id') THEN
    ALTER TABLE deals ADD COLUMN contact_id UUID NULL REFERENCES contacts(id);
  END IF;
END $$;

-- client_exchange_operations: добавляем contact_id
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_exchange_operations' AND column_name = 'contact_id') THEN
    ALTER TABLE client_exchange_operations ADD COLUMN contact_id UUID NULL REFERENCES contacts(id);
  END IF;
END $$;

-- auto_clients: добавляем contact_id
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auto_clients' AND column_name = 'contact_id') THEN
    ALTER TABLE auto_clients ADD COLUMN contact_id UUID NULL REFERENCES contacts(id);
  END IF;
END $$;

-- auto_deals: добавляем buyer_contact_id и seller_contact_id
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auto_deals' AND column_name = 'buyer_contact_id') THEN
    ALTER TABLE auto_deals ADD COLUMN buyer_contact_id UUID NULL REFERENCES contacts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auto_deals' AND column_name = 'seller_contact_id') THEN
    ALTER TABLE auto_deals ADD COLUMN seller_contact_id UUID NULL REFERENCES contacts(id);
  END IF;
END $$;

-- =====================
-- 4. ФУНКЦИИ (RPC)
-- =====================

-- Нормализация телефона
CREATE OR REPLACE FUNCTION normalize_phone(p TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  -- Удаляем все кроме цифр
  digits := regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g');
  
  -- Если 11 цифр и начинается с 8 -> заменить на 7
  IF length(digits) = 11 AND left(digits, 1) = '8' THEN
    digits := '7' || substring(digits, 2);
  -- Если 10 цифр и начинается с 9 -> добавить 7 впереди
  ELSIF length(digits) = 10 AND left(digits, 1) = '9' THEN
    digits := '7' || digits;
  END IF;
  
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Нормализация email
CREATE OR REPLACE FUNCTION normalize_email(p TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(trim(COALESCE(p, '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Получить или создать контакт
CREATE OR REPLACE FUNCTION get_or_create_contact(
  p_display_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_module TEXT
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
  v_normalized_phone TEXT;
  v_normalized_email TEXT;
  v_existing_name TEXT;
BEGIN
  -- Нормализуем входные данные
  v_normalized_phone := normalize_phone(p_phone);
  v_normalized_email := normalize_email(p_email);
  
  -- Пытаемся найти контакт по телефону
  IF v_normalized_phone != '' THEN
    SELECT contact_id INTO v_contact_id
    FROM contact_channels
    WHERE type = 'phone' AND normalized = v_normalized_phone
    LIMIT 1;
  END IF;
  
  -- Если не нашли по телефону, ищем по email
  IF v_contact_id IS NULL AND v_normalized_email != '' THEN
    SELECT contact_id INTO v_contact_id
    FROM contact_channels
    WHERE type = 'email' AND normalized = v_normalized_email
    LIMIT 1;
  END IF;
  
  -- Если нашли существующий контакт
  IF v_contact_id IS NOT NULL THEN
    -- Обновляем display_name если он пустой или короче нового
    SELECT display_name INTO v_existing_name FROM contacts WHERE id = v_contact_id;
    IF v_existing_name IS NULL OR length(v_existing_name) < length(COALESCE(p_display_name, '')) THEN
      UPDATE contacts SET display_name = COALESCE(p_display_name, v_existing_name), updated_at = now()
      WHERE id = v_contact_id;
    END IF;
    
    -- Upsert сегмент для модуля
    INSERT INTO contact_segments (contact_id, module, last_activity_at)
    VALUES (v_contact_id, p_module, now())
    ON CONFLICT (contact_id, module)
    DO UPDATE SET last_activity_at = now(), updated_at = now();
    
    RETURN v_contact_id;
  END IF;
  
  -- Создаем новый контакт
  INSERT INTO contacts (display_name)
  VALUES (COALESCE(NULLIF(p_display_name, ''), 'Без имени'))
  RETURNING id INTO v_contact_id;
  
  -- Добавляем телефон как primary канал
  IF v_normalized_phone != '' THEN
    INSERT INTO contact_channels (contact_id, type, value, normalized, is_primary)
    VALUES (v_contact_id, 'phone', COALESCE(p_phone, ''), v_normalized_phone, true)
    ON CONFLICT (type, normalized) DO NOTHING;
  END IF;
  
  -- Добавляем email
  IF v_normalized_email != '' THEN
    INSERT INTO contact_channels (contact_id, type, value, normalized, is_primary)
    VALUES (v_contact_id, 'email', COALESCE(p_email, ''), v_normalized_email, v_normalized_phone = '')
    ON CONFLICT (type, normalized) DO NOTHING;
  END IF;
  
  -- Создаем сегмент для модуля
  INSERT INTO contact_segments (contact_id, module, last_activity_at)
  VALUES (v_contact_id, p_module, now());
  
  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- Upsert сегмента контакта
CREATE OR REPLACE FUNCTION upsert_contact_segment(p_contact_id UUID, p_module TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO contact_segments (contact_id, module, last_activity_at)
  VALUES (p_contact_id, p_module, now())
  ON CONFLICT (contact_id, module)
  DO UPDATE SET last_activity_at = now(), updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Логирование события контакта
CREATE OR REPLACE FUNCTION log_contact_event(
  p_contact_id UUID,
  p_module TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_title TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Вставляем событие
  INSERT INTO contact_events (contact_id, module, entity_type, entity_id, title, payload)
  VALUES (p_contact_id, p_module, p_entity_type, p_entity_id, p_title, p_payload)
  RETURNING id INTO v_event_id;
  
  -- Обновляем last_activity_at в сегменте
  UPDATE contact_segments
  SET last_activity_at = now(), updated_at = now()
  WHERE contact_id = p_contact_id AND module = p_module;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- 5. ТРИГГЕРЫ
-- =====================

-- Триггер: заполнение buyer_contact_id/seller_contact_id в auto_deals из auto_clients
CREATE OR REPLACE FUNCTION trg_auto_deals_fill_contact_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- Заполняем buyer_contact_id из auto_clients
  IF NEW.buyer_id IS NOT NULL AND NEW.buyer_contact_id IS NULL THEN
    SELECT contact_id INTO NEW.buyer_contact_id
    FROM auto_clients WHERE id = NEW.buyer_id;
  END IF;
  
  -- Заполняем seller_contact_id из auto_clients
  IF NEW.seller_id IS NOT NULL AND NEW.seller_contact_id IS NULL THEN
    SELECT contact_id INTO NEW.seller_contact_id
    FROM auto_clients WHERE id = NEW.seller_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_deals_fill_contact_ids ON auto_deals;
CREATE TRIGGER trg_auto_deals_fill_contact_ids
  BEFORE INSERT OR UPDATE ON auto_deals
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_deals_fill_contact_ids();

-- =====================
-- 6. ОБНОВЛЕНИЕ updated_at
-- =====================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_contact_segments_updated_at ON contact_segments;
CREATE TRIGGER trg_contact_segments_updated_at
  BEFORE UPDATE ON contact_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_contact_sensitive_updated_at ON contact_sensitive;
CREATE TRIGGER trg_contact_sensitive_updated_at
  BEFORE UPDATE ON contact_sensitive
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
