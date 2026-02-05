-- =========================================================
-- Backfill: Миграция существующих данных в модуль контактов
-- Файл: scripts/003_contacts_backfill.sql
-- 
-- ВАЖНО: Этот скрипт НЕ запускается автоматически!
-- Выполните его вручную после проверки данных.
-- =========================================================

-- =====================
-- 1. Backfill для client_exchange_operations
-- =====================
DO $$
DECLARE
  rec RECORD;
  v_contact_id UUID;
BEGIN
  FOR rec IN 
    SELECT id, client_name, client_phone 
    FROM client_exchange_operations 
    WHERE contact_id IS NULL AND (client_name IS NOT NULL OR client_phone IS NOT NULL)
  LOOP
    -- Создаем или находим контакт
    v_contact_id := get_or_create_contact(
      COALESCE(rec.client_name, 'Клиент обмена'),
      rec.client_phone,
      NULL,
      'exchange'
    );
    
    -- Обновляем операцию
    UPDATE client_exchange_operations 
    SET contact_id = v_contact_id 
    WHERE id = rec.id;
    
    RAISE NOTICE 'Exchange operation % linked to contact %', rec.id, v_contact_id;
  END LOOP;
END $$;

-- =====================
-- 2. Backfill для deals
-- =====================
DO $$
DECLARE
  rec RECORD;
  v_contact_id UUID;
BEGIN
  FOR rec IN 
    SELECT id, client_name, client_phone, client_email 
    FROM deals 
    WHERE contact_id IS NULL AND client_name IS NOT NULL
  LOOP
    -- Создаем или находим контакт
    v_contact_id := get_or_create_contact(
      rec.client_name,
      rec.client_phone,
      rec.client_email,
      'deals'
    );
    
    -- Обновляем сделку
    UPDATE deals 
    SET contact_id = v_contact_id 
    WHERE id = rec.id;
    
    RAISE NOTICE 'Deal % linked to contact %', rec.id, v_contact_id;
  END LOOP;
END $$;

-- =====================
-- 3. Backfill для auto_clients
-- =====================
DO $$
DECLARE
  rec RECORD;
  v_contact_id UUID;
BEGIN
  FOR rec IN 
    SELECT id, full_name, phone, email, 
           passport_series, passport_number, passport_issued_by, passport_issued_date,
           address, driver_license, driver_license_date
    FROM auto_clients 
    WHERE contact_id IS NULL
  LOOP
    -- Создаем или находим контакт
    v_contact_id := get_or_create_contact(
      rec.full_name,
      rec.phone,
      rec.email,
      'auto'
    );
    
    -- Обновляем автоклиента
    UPDATE auto_clients 
    SET contact_id = v_contact_id 
    WHERE id = rec.id;
    
    -- Сохраняем чувствительные данные
    INSERT INTO contact_sensitive (
      contact_id, 
      passport_series, passport_number, passport_issued_by, passport_issued_date,
      address, driver_license, driver_license_date
    ) VALUES (
      v_contact_id,
      rec.passport_series, rec.passport_number, rec.passport_issued_by, rec.passport_issued_date,
      rec.address, rec.driver_license, rec.driver_license_date
    )
    ON CONFLICT (contact_id) 
    DO UPDATE SET
      passport_series = COALESCE(contact_sensitive.passport_series, EXCLUDED.passport_series),
      passport_number = COALESCE(contact_sensitive.passport_number, EXCLUDED.passport_number),
      passport_issued_by = COALESCE(contact_sensitive.passport_issued_by, EXCLUDED.passport_issued_by),
      passport_issued_date = COALESCE(contact_sensitive.passport_issued_date, EXCLUDED.passport_issued_date),
      address = COALESCE(contact_sensitive.address, EXCLUDED.address),
      driver_license = COALESCE(contact_sensitive.driver_license, EXCLUDED.driver_license),
      driver_license_date = COALESCE(contact_sensitive.driver_license_date, EXCLUDED.driver_license_date),
      updated_at = now();
    
    RAISE NOTICE 'Auto client % linked to contact %', rec.id, v_contact_id;
  END LOOP;
END $$;

-- =====================
-- 4. Backfill для auto_deals (buyer_contact_id / seller_contact_id)
-- =====================
UPDATE auto_deals ad
SET 
  buyer_contact_id = (SELECT contact_id FROM auto_clients WHERE id = ad.buyer_id),
  seller_contact_id = (SELECT contact_id FROM auto_clients WHERE id = ad.seller_id)
WHERE buyer_contact_id IS NULL OR seller_contact_id IS NULL;

-- =====================
-- 5. Статистика после backfill
-- =====================
DO $$
DECLARE
  v_contacts_count INT;
  v_exchange_linked INT;
  v_deals_linked INT;
  v_auto_clients_linked INT;
  v_auto_deals_linked INT;
BEGIN
  SELECT COUNT(*) INTO v_contacts_count FROM contacts;
  SELECT COUNT(*) INTO v_exchange_linked FROM client_exchange_operations WHERE contact_id IS NOT NULL;
  SELECT COUNT(*) INTO v_deals_linked FROM deals WHERE contact_id IS NOT NULL;
  SELECT COUNT(*) INTO v_auto_clients_linked FROM auto_clients WHERE contact_id IS NOT NULL;
  SELECT COUNT(*) INTO v_auto_deals_linked FROM auto_deals WHERE buyer_contact_id IS NOT NULL OR seller_contact_id IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '========== BACKFILL SUMMARY ==========';
  RAISE NOTICE 'Total contacts created: %', v_contacts_count;
  RAISE NOTICE 'Exchange operations linked: %', v_exchange_linked;
  RAISE NOTICE 'Deals linked: %', v_deals_linked;
  RAISE NOTICE 'Auto clients linked: %', v_auto_clients_linked;
  RAISE NOTICE 'Auto deals linked: %', v_auto_deals_linked;
  RAISE NOTICE '======================================';
END $$;
