-- =========================================================
-- 004_team_access.sql
-- Единый центр управления сотрудниками и доступами
-- =========================================================

-- 1. Расширяем таблицу employees
-- =========================================================

-- module_access: { "exchange":"view|work|manage", "auto":"view|work|manage", "deals":"...", "stock":"..." }
ALTER TABLE employees ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '{}'::jsonb;

-- module_visibility: { "exchange":{"scope":"all|own|team|branch"}, ... } (пока применяем только "all")
ALTER TABLE employees ADD COLUMN IF NOT EXISTS module_visibility JSONB DEFAULT 
  '{"exchange":{"scope":"all"},"auto":{"scope":"all"},"deals":{"scope":"all"},"stock":{"scope":"all"}}'::jsonb;

-- auth_user_id если еще нет (связь с auth.users без FK для гибкости)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_auth_user_id_unique ON employees(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 2. Таблица назначений ролей сотрудникам (source of truth)
-- =========================================================
CREATE TABLE IF NOT EXISTS employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID NULL,
  UNIQUE(employee_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_roles_employee ON employee_roles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_roles_role ON employee_roles(role_id);

-- 3. Таблица приглашений сотрудников
-- =========================================================
CREATE TABLE IF NOT EXISTS employee_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'cancelled')) DEFAULT 'draft',
  invited_at TIMESTAMPTZ DEFAULT now(),
  invited_by UUID NULL,
  token TEXT NULL,
  expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_invites_employee ON employee_invites(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_invites_status ON employee_invites(status);

-- 4. position_default_roles если не существует
-- =========================================================
CREATE TABLE IF NOT EXISTS position_default_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position TEXT NOT NULL,
  system_role_id UUID NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(position, system_role_id)
);

CREATE INDEX IF NOT EXISTS idx_position_default_roles_position ON position_default_roles(position);

-- 5. Добавляем колонку module в system_roles если нет
-- =========================================================
ALTER TABLE system_roles ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'system';

-- 6. Preset роли для модулей B3 (12 ролей)
-- =========================================================
-- EXCHANGE module
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('EXCHANGE_VIEW', 'Обмен: Просмотр', 'Просмотр операций обмена валют', 'exchange', 
   ARRAY['exchange.read', 'contacts.segment.exchange.read'], true),
  ('EXCHANGE_WORK', 'Обмен: Работа', 'Проведение операций обмена', 'exchange', 
   ARRAY['exchange.read', 'exchange.write', 'contacts.segment.exchange.read', 'contacts.segment.exchange.write'], true),
  ('EXCHANGE_MANAGE', 'Обмен: Управление', 'Полное управление обменом', 'exchange', 
   ARRAY['exchange.read', 'exchange.write', 'exchange.manage', 'exchange.settings', 'contacts.segment.exchange.read', 'contacts.segment.exchange.write'], true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;

-- AUTO module
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('AUTO_VIEW', 'Авто: Просмотр', 'Просмотр автоплощадки', 'auto', 
   ARRAY['auto.read', 'contacts.segment.auto.read'], true),
  ('AUTO_WORK', 'Авто: Работа', 'Работа с автомобилями и сделками', 'auto', 
   ARRAY['auto.read', 'auto.write', 'contacts.segment.auto.read', 'contacts.segment.auto.write'], true),
  ('AUTO_MANAGE', 'Авто: Управление', 'Полное управление автоплощадкой', 'auto', 
   ARRAY['auto.read', 'auto.write', 'auto.manage', 'auto.settings', 'contacts.segment.auto.read', 'contacts.segment.auto.write'], true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;

-- DEALS module
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('DEALS_VIEW', 'Сделки: Просмотр', 'Просмотр сделок', 'deals', 
   ARRAY['deals.read', 'contacts.segment.deals.read'], true),
  ('DEALS_WORK', 'Сделки: Работа', 'Проведение сделок', 'deals', 
   ARRAY['deals.read', 'deals.write', 'contacts.segment.deals.read', 'contacts.segment.deals.write'], true),
  ('DEALS_MANAGE', 'Сделки: Управление', 'Полное управление сделками', 'deals', 
   ARRAY['deals.read', 'deals.write', 'deals.manage', 'deals.settings', 'contacts.segment.deals.read', 'contacts.segment.deals.write'], true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;

-- STOCK module
INSERT INTO system_roles (code, name, description, module, permissions, is_system) VALUES
  ('STOCK_VIEW', 'Склад: Просмотр', 'Просмотр склада', 'stock', 
   ARRAY['stock.read'], true),
  ('STOCK_WORK', 'Склад: Работа', 'Работа со складом', 'stock', 
   ARRAY['stock.read', 'stock.write'], true),
  ('STOCK_MANAGE', 'Склад: Управление', 'Полное управление складом', 'stock', 
   ARRAY['stock.read', 'stock.write', 'stock.manage', 'stock.settings'], true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  permissions = EXCLUDED.permissions;

-- 7. Функция синхронизации employee_roles -> user_roles
-- =========================================================
CREATE OR REPLACE FUNCTION sync_employee_roles_to_user_roles(p_employee_id UUID)
RETURNS void AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Получаем auth_user_id сотрудника
  SELECT auth_user_id INTO v_auth_user_id 
  FROM employees 
  WHERE id = p_employee_id;
  
  -- Если нет привязки к auth.users - ничего не делаем
  IF v_auth_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Удаляем старые роли пользователя
  DELETE FROM user_roles WHERE user_id = v_auth_user_id;
  
  -- Копируем роли из employee_roles
  INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
  SELECT v_auth_user_id, er.role_id, er.assigned_at, er.assigned_by
  FROM employee_roles er
  WHERE er.employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Триггер для автосинхронизации при изменении employee_roles
-- =========================================================
CREATE OR REPLACE FUNCTION trigger_sync_employee_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM sync_employee_roles_to_user_roles(NEW.employee_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM sync_employee_roles_to_user_roles(OLD.employee_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employee_roles ON employee_roles;
CREATE TRIGGER trg_sync_employee_roles
AFTER INSERT OR UPDATE OR DELETE ON employee_roles
FOR EACH ROW EXECUTE FUNCTION trigger_sync_employee_roles();

-- 9. Маппинг должностей по умолчанию (если нет)
-- =========================================================
INSERT INTO position_default_roles (position, system_role_id)
SELECT 'Директор', id FROM system_roles WHERE code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO position_default_roles (position, system_role_id)
SELECT 'Менеджер', id FROM system_roles WHERE code = 'MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO position_default_roles (position, system_role_id)
SELECT 'Бухгалтер', id FROM system_roles WHERE code = 'ACCOUNTANT'
ON CONFLICT DO NOTHING;

INSERT INTO position_default_roles (position, system_role_id)
SELECT 'Оператор обмена', id FROM system_roles WHERE code = 'EXCHANGE_WORK'
ON CONFLICT DO NOTHING;

INSERT INTO position_default_roles (position, system_role_id)
SELECT 'Продавец авто', id FROM system_roles WHERE code = 'AUTO_WORK'
ON CONFLICT DO NOTHING;
