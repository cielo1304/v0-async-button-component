-- =========================================================
-- 005a_foundation.sql
-- Создаёт функцию update_updated_at_column + audit_log + audit_log_v2
-- =========================================================

-- Функция для auto-обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

-- audit_log (простая таблица для прямого логирования)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NULL,
  action TEXT NOT NULL,
  old_data JSONB NULL,
  new_data JSONB NULL,
  changed_by TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name, created_at DESC);

-- audit_log_v2 (модульная версия)
CREATE TABLE IF NOT EXISTS audit_log_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id UUID NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before JSONB NULL,
  after JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_v2_module_created ON audit_log_v2(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_v2_actor_created ON audit_log_v2(actor_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_v2_entity ON audit_log_v2(entity_table, entity_id);
