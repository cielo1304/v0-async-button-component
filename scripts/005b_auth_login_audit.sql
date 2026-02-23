-- =========================================================
-- 005b_auth_login_audit.sql
-- DB-level login audit logging via trigger on auth.audit_log_entries
-- =========================================================
--
-- ЦЕЛЬ: Автоматически логировать логины на уровне БД в public.audit_log.
-- Это избавляет от необходимости клиентского логирования и предотвращает подделки.
--
-- ТРИГГЕР: слушает INSERT в auth.audit_log_entries (куда Supabase пишет все auth события)
-- При action='login' -> создаёт запись в public.audit_log с полной информацией.
--
-- PAYLOAD COMPATIBILITY:
-- Разные версии Supabase могут использовать разные ключи:
--   - user_id ИЛИ actor_id для идентификатора пользователя
--   - email ИЛИ actor_username для email
--   - metadata->provider ИЛИ traits->provider для провайдера
-- Используем coalesce() для совместимости.
-- =========================================================

-- Функция для логирования логинов из auth.audit_log_entries
CREATE OR REPLACE FUNCTION log_auth_login_to_audit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  actor TEXT;
  email TEXT;
  provider TEXT;
  company_id UUID;
BEGIN
  -- Проверяем, что это событие логина
  IF NEW.payload->>'action' = 'login' THEN
    
    -- Извлекаем user_id (совместимость с разными версиями payload)
    actor := COALESCE(
      NEW.payload->>'user_id',
      NEW.payload->>'actor_id'
    );
    
    -- Извлекаем email
    email := COALESCE(
      NEW.payload->>'email',
      NEW.payload->>'actor_username'
    );
    
    -- Извлекаем provider (email, google, etc.)
    provider := COALESCE(
      NEW.payload->'metadata'->>'provider',
      NEW.payload->'traits'->>'provider',
      'email' -- default
    );
    
    -- Пытаемся получить company_id из employees
    -- Если пользователь - platform admin без company, будет NULL
    SELECT e.company_id INTO company_id
    FROM employees e
    WHERE e.auth_user_id = actor::UUID
    LIMIT 1;
    
    -- Вставляем в audit_log
    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      new_data,
      changed_by,
      created_at
    ) VALUES (
      'auth_events',
      actor,
      'INSERT',
      jsonb_build_object(
        'event', 'sign_in',
        'user_id', actor,
        'email', email,
        'company_id', company_id,
        'timestamp', NEW.created_at,
        'ip_address', NEW.ip_address,
        'provider', provider,
        'payload', NEW.payload
      ),
      actor,
      NEW.created_at
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Создаём триггер на auth.audit_log_entries
-- ВАЖНО: триггер AFTER INSERT, чтобы не блокировать аутентификацию
DROP TRIGGER IF EXISTS trigger_log_auth_login ON auth.audit_log_entries;

CREATE TRIGGER trigger_log_auth_login
  AFTER INSERT ON auth.audit_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION log_auth_login_to_audit();

-- =========================================================
-- SMOKE CHECK / VERIFICATION QUERIES
-- =========================================================
-- Эти запросы НЕ выполняются автоматически.
-- Используй их для ручной проверки после применения скрипта.

-- 1) Проверить, что триггер создан
-- SELECT tgname, tgrelid::regclass, tgenabled
-- FROM pg_trigger
-- WHERE tgname = 'trigger_log_auth_login';

-- 2) Проверить последние auth события в auth.audit_log_entries
-- SELECT 
--   id,
--   payload->>'action' as action,
--   payload->>'user_id' as user_id,
--   payload->>'email' as email,
--   ip_address,
--   created_at
-- FROM auth.audit_log_entries
-- WHERE payload->>'action' = 'login'
-- ORDER BY created_at DESC
-- LIMIT 10;

-- 3) Проверить логи логинов в public.audit_log
-- SELECT 
--   id,
--   table_name,
--   record_id,
--   new_data->>'event' as event_type,
--   new_data->>'email' as email,
--   new_data->>'company_id' as company_id,
--   new_data->>'ip_address' as ip_address,
--   new_data->>'provider' as provider,
--   created_at
-- FROM audit_log
-- WHERE table_name = 'auth_events'
--   AND new_data->>'event' = 'sign_in'
-- ORDER BY created_at DESC
-- LIMIT 20;

-- 4) Проверить platform admin логины (company_id NULL - это нормально)
-- SELECT 
--   id,
--   new_data->>'email' as email,
--   new_data->>'user_id' as user_id,
--   new_data->>'company_id' as company_id,
--   created_at
-- FROM audit_log
-- WHERE table_name = 'auth_events'
--   AND new_data->>'event' = 'sign_in'
--   AND (new_data->>'company_id' IS NULL OR new_data->>'company_id' = 'null')
-- ORDER BY created_at DESC;

-- =========================================================
-- ПОСЛЕ ПРИМЕНЕНИЯ СКРИПТА:
-- =========================================================
-- 1. Залогинься как обычный пользователь → проверь запрос #3
-- 2. Залогинься как platform admin → проверь запрос #4
-- 3. Убедись, что записи появляются автоматически БЕЗ клиентского кода
