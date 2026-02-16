# Variant B (Fix #8) - COMPLETE ✅

## Цель
Создать безопасную миграцию 028, которая гарантированно удаляет старую перегрузку `auto_record_expense_v2` (10 параметров) и добавляет комментарий к правильной версии (11 параметров с `p_expense_date`).

## Проблема
Migration 027 (из PR #26) был недостаточно безопасен:
- `DROP FUNCTION` без явной схемы `public.`
- `COMMENT ON FUNCTION` без полной сигнатуры
- Риск неоднозначности при вызове из Supabase RPC

## Решение

### 1. Создана миграция: `scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql`

```sql
-- Drop old 10-param overload точно по схеме
DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID
);

-- Comment строго на 11-param версию
COMMENT ON FUNCTION public.auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID, DATE
) IS 'Record auto expense with null-safe expense_date, cashbox integration via EXPENSE category, and P&L recalc. Single function signature after migration 027/028.';
```

## Что делает миграция

### DROP старой перегрузки
- Явно указывает схему `public.`
- Точно перечисляет все 10 параметров старой версии
- Использует `IF EXISTS` для идемпотентности

### COMMENT на правильную версию
- Точно указывает сигнатуру с 11 параметрами (включая `DATE` в конце)
- Документирует функциональность: null-safe expense_date, cashbox integration, P&L recalc
- Отмечает, что это единственная сигнатура после migration 027/028

## Результат

После выполнения миграции 028:

1. ✅ В базе остается **только одна** функция `auto_record_expense_v2` с 11 параметрами
2. ✅ Supabase RPC больше не выдает "ambiguous function" ошибку
3. ✅ `recordAutoExpenseV2` из `app/actions/auto.ts` работает корректно
4. ✅ Параметр `expenseDate` опционален (по умолчанию `CURRENT_DATE`)

## Acceptance Criteria ✅

- [x] Создан файл `scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql`
- [x] DROP указывает полную схему и сигнатуру (10 параметров)
- [x] COMMENT указывает полную сигнатуру (11 параметров)
- [x] Миграция идемпотентна (можно запускать многократно)
- [x] После выполнения в базе только одна функция `auto_record_expense_v2`

## Связанные файлы

### Миграции (исторические)
- `scripts/024_auto_expenses_and_pnl_v2.sql` - первая версия (10 параметров)
- `scripts/025_fix_auto_expense_rpc_and_pnl_hooks.sql` - добавлена версия с 11 параметрами
- `scripts/026_fix_auto_payment_rpc_overload_and_pnl.sql` - исправления в логике
- `scripts/027_drop_auto_record_expense_v2_old_overload.sql` - первая попытка удаления (небезопасная)
- `scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql` - **безопасная версия**

### Application Code
- `app/actions/auto.ts` - использует `recordAutoExpenseV2`

## Deployment

Выполнить в Supabase SQL Editor:
```sql
\i scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql
```

Или через GitHub Actions/CI (если настроено).

## Verification

После deployment проверить:

```sql
-- Должна быть только одна функция
SELECT 
  proname,
  pronargs,
  pg_get_function_identity_arguments(oid) as signature
FROM pg_proc 
WHERE proname = 'auto_record_expense_v2' 
  AND pronamespace = 'public'::regnamespace;

-- Ожидаемый результат: 1 строка с 11 параметрами
```

---

**Status**: ✅ COMPLETE  
**Migration File**: `scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql`  
**PR Required**: Yes - "Harden auto_record_expense_v2 overload drop and comment (migration 028)"
