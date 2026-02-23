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
--   - action ИЛИ type для типа события (используем 'login')
--   - user_id ИЛИ actor_id ИЛИ subject ИЛИ sub для идентификатора
--   - email ИЛИ actor_username для email
--   - metadata->provider ИЛИ traits->provider для провайдера
-- Используем coalesce() для совместимости со всеми версиями.
-- =========================================================

-- Идемпотентно удаляем старый триггер (если есть)
DROP TRIGGER IF EXISTS trigger_log_auth_login ON auth.audit_log_entries;

-- Функция для логирования логинов из auth.audit_log_entries
CREATE OR REPLACE FUNCTION log_auth_login_to_audit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  event_action TEXT;
  actor TEXT;
  email TEXT;
  provider TEXT;
  company_id UUID;
  actor_uuid UUID;
  ts TIMESTAMPTZ; -- Timestamp with NULL fallback
BEGIN
  -- 0) Обрабатываем возможный NULL в created_at (при ручной симуляции)
  ts := COALESCE(NEW.created_at, now());
  
  -- 1) Определяем тип события (совместимость с разными payload)
  event_action := COALESCE(
    NEW.payload->>'action',
    NEW.payload->>'type'
  );
  
  -- Проверяем, что это событие логина
  IF event_action IS NULL OR event_action <> 'login' THEN
    RETURN NEW;
  END IF;
  
  -- 2) Извлекаем actor (user_id) - совместимость с разными версиями
  actor := COALESCE(
    NEW.payload->>'user_id',
    NEW.payload->>'actor_id',
    NEW.payload->>'subject',
    NEW.payload->>'sub'
  );
  
  -- Если actor не найден - выходим
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- 3) Извлекаем email/username
  email := COALESCE(
    NEW.payload->>'email',
    NEW.payload->>'actor_username'
  );
  
  -- 4) Извлекаем provider (email, google, github, etc.)
  provider := COALESCE(
    NEW.payload->'metadata'->>'provider',
    NEW.payload->'traits'->>'provider',
    'email' -- default fallback
  );
  
  -- 5) Пытаемся получить company_id из employees через auth_user_id
  -- Обрабатываем возможные ошибки cast (если actor не UUID)
  BEGIN
    actor_uuid := actor::UUID;
    
    -- Запрашиваем company_id из employees
    SELECT e.company_id INTO company_id
    FROM employees e
    WHERE e.auth_user_id = actor_uuid
    LIMIT 1;
    
  EXCEPTION
    WHEN invalid_text_representation THEN
      -- Если actor не UUID - company_id остаётся NULL
      company_id := NULL;
    WHEN others THEN
      -- Любая другая ошибка - также NULL (graceful degradation)
      company_id := NULL;
  END;
  
  -- 6) Вставляем в audit_log
  INSERT INTO audit_log (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    created_at
  ) VALUES (
    'auth_events',
    actor,
    'INSERT',
    NULL, -- old_data всегда NULL для новых логинов
    jsonb_build_object(
      'event', 'sign_in',
      'user_id', actor,
      'email', email,
      'company_id', company_id,
      'ip_address', NEW.ip_address,
      'timestamp', ts, -- используем обработанный timestamp
      'provider', provider,
      'payload', NEW.payload -- полный payload для отладки
    ),
    actor,
    ts -- используем обработанный timestamp
  );
  
  RETURN NEW;
END;
$$;

-- Создаём триггер на auth.audit_log_entries
-- ВАЖНО: триггер AFTER INSERT, чтобы не блокировать аутентификацию
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
-- Expected: 1 row with tgenabled='O' (enabled)

-- 2) Проверить последние auth события в auth.audit_log_entries
-- SELECT 
--   id,
--   payload->>'action' as action,
--   payload->>'type' as type,
--   payload->>'user_id' as user_id,
--   payload->>'actor_id' as actor_id,
--   payload->>'email' as email,
--   ip_address,
--   created_at
-- FROM auth.audit_log_entries
-- WHERE COALESCE(payload->>'action', payload->>'type') = 'login'
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
-- 4. Обнови страницу 5 раз (refresh) → убедись, что НЕТ ДУБЛЕЙ (только 1 запись)

-- =========================================================
-- FALLBACK: Альтернативный подход через auth.refresh_tokens
-- =========================================================
-- ИСПОЛЬЗУЙ ТОЛЬКО ЕСЛИ ОСНОВНОЙ ТРИГГЕР НЕ РАБОТАЕТ
-- (например, если нет прав на auth.audit_log_entries)
--
-- Закомментировано, т.к. основной подход предпочтительнее.
-- Раскомментируй только в случае проблем с правами.

/*
-- Fallback триггер на auth.refresh_tokens
DROP TRIGGER IF EXISTS trigger_log_auth_login_fallback ON auth.refresh_tokens;

CREATE OR REPLACE FUNCTION log_auth_login_to_audit_fallback()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_email TEXT;
  company_id UUID;
BEGIN
  -- Получаем email пользователя
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.user_id;
  
  -- Получаем company_id из employees
  SELECT e.company_id INTO company_id
  FROM employees e
  WHERE e.auth_user_id = NEW.user_id
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
    NEW.user_id::TEXT,
    'INSERT',
    jsonb_build_object(
      'event', 'sign_in',
      'user_id', NEW.user_id::TEXT,
      'email', user_email,
      'company_id', company_id,
      'timestamp', NEW.created_at,
      'provider', 'refresh_token_based',
      'session_id', NEW.session_id
    ),
    NEW.user_id::TEXT,
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_auth_login_fallback
  AFTER INSERT ON auth.refresh_tokens
  FOR EACH ROW
  EXECUTE FUNCTION log_auth_login_to_audit_fallback();
*/

-- =========================================================
-- NOTES
-- =========================================================
-- 1. Основной триггер использует auth.audit_log_entries - это правильный источник
-- 2. Fallback триггер на auth.refresh_tokens может создавать дубли при token refresh
-- 3. SECURITY DEFINER нужен, чтобы функция могла читать auth схему
-- 4. Graceful degradation: если company_id не найден - это ок (NULL для platform admin)
-- 5. Триггер AFTER INSERT, поэтому не влияет на производительность логина
