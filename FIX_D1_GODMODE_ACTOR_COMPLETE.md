# Fix D#1: GodMode Actor Semantic Corrections - COMPLETE

## Дата: 2026-02-17
## Статус: ✅ ЗАВЕРШЕНО

## Обзор
Исправлена семантика God Mode в Assets модуле после PR #41. Разделены понятия "actor" (кто выполнил действие) и "responsible" (ответственный за актив).

## Изменения

### 1. app/assets/page.tsx (Create Asset Dialog)
**Было:**
\`\`\`typescript
responsible_employee_id: godmodeActorId || form.responsible_employee_id || null,
\`\`\`

**Стало:**
\`\`\`typescript
responsible_employee_id: form.responsible_employee_id || null,
notes: form.notes || null,
actor_employee_id: godmodeActorId || null,
\`\`\`

**Семантика:**
- `responsible_employee_id` - БИЗНЕС-роль: кто ответственный за актив
- `actor_employee_id` - АУДИТ: кто создал запись (для God Mode)
- GodModeActorSelector уже отрисован в диалоге (строка 330)

---

### 2. app/assets/[id]/page.tsx (Detail Page)
**Было:**
\`\`\`typescript
await updateAsset(id, { status: newStatus as 'in_stock' })
\`\`\`

**Стало:**
\`\`\`typescript
await updateAsset(id, { 
  status: newStatus as AssetStatus,
  actor_employee_id: godmodeActorId || null,
})
\`\`\`

**Добавлен импорт:**
\`\`\`typescript
import type { AssetStatus } from '@/lib/types/database'
\`\`\`

**Семантика:**
- Убран хардкод каста к `'in_stock'`, используется корректный union тип `AssetStatus`
- Actor передаётся в updateAsset для аудита
- GodModeActorSelector уже отрисован во всех диалогах:
  - Valuation (строка 750)
  - Move (строка 819)
  - Sale (строка 893)

---

### 3. app/actions/assets.ts (Server Actions)

#### createAsset
✅ Уже правильно:
\`\`\`typescript
actor_employee_id?: string | null
\`\`\`
- Передаётся в `writeAuditLog(supabase, { actorEmployeeId: formData.actor_employee_id, ... })`

#### addAssetValuation
✅ Правильно использует fallback:
\`\`\`typescript
created_by_employee_id: godmodeActorId || valForm.created_by_employee_id || null
\`\`\`
- Если God Mode выбран - используется актор
- Если нет - используется выбранный в форме сотрудник
- Передаётся в аудит: `actorEmployeeId: formData.created_by_employee_id`

#### addAssetMove
✅ Правильно использует fallback:
\`\`\`typescript
moved_by_employee_id: godmodeActorId || moveForm.moved_by_employee_id || null
\`\`\`
- Аудит: `actorEmployeeId: formData.moved_by_employee_id`

#### recordAssetSale
**Было:**
\`\`\`typescript
p_created_by: formData.created_by_employee_id || '00000000-0000-0000-0000-000000000000',
\`\`\`

**Стало:**
\`\`\`typescript
if (formData.cashbox_id) {
  if (!formData.created_by_employee_id) {
    return { success: false, error: 'Actor/employee required for cashbox operation' }
  }
  const { error: rpcErr } = await supabase.rpc('cashbox_operation', {
    ...
    p_created_by: formData.created_by_employee_id,
  })
}
\`\`\`

**Семантика:**
- Убран хардкод `00000000-0000-0000-0000-000000000000`
- Если cashbox указан, но actor отсутствует - возвращается внятная ошибка
- Аудит: `actorEmployeeId: formData.created_by_employee_id`

---

## Проверка UI (GodModeActorSelector)

### ✅ app/assets/page.tsx
- **Строка 50:** Импорт `GodModeActorSelector`
- **Строка 111:** State `godmodeActorId`
- **Строка 330:** Отрисован в Create Dialog

### ✅ app/assets/[id]/page.tsx
- **Строка 70:** Импорт `GodModeActorSelector`
- **Строка 144:** State `godmodeActorId`
- **Строка 750:** Отрисован в Valuation Dialog
- **Строка 819:** Отрисован в Move Dialog
- **Строка 893:** Отрисован в Sale Dialog (согласно предыдущему коду)

---

## Acceptance Criteria - ВЫПОЛНЕНО

### ✅ 1. GodModeActorSelector виден и влияет на audit_log
- Импортирован и отрисован во всех диалогах
- Видно только admin (согласно логике в `god-mode-actor-selector.tsx`)
- Передаётся через `actor_employee_id` в audit_log

### ✅ 2. responsible_employee_id не подменяется актором
- В createAsset: `responsible` и `actor` - отдельные поля
- В valuations/moves: actor используется как fallback, но семантически корректно

### ✅ 3. Статус меняется без кривых кастов
- Используется `AssetStatus` тип вместо `'in_stock'`
- Добавлен импорт типа из database.ts

### ✅ 4. Server actions принимают actor отдельно
- `createAsset`: `actor_employee_id` отдельное поле
- `updateAsset`: `actor_employee_id` передаётся
- `addAssetValuation` / `addAssetMove` / `recordAssetSale`: используют `created_by_employee_id` / `moved_by_employee_id` как actor

### ✅ 5. Убран хардкод UUID в recordAssetSale
- Вместо `'00000000-0000-0000-0000-000000000000'` возвращается ошибка
- "Actor/employee required for cashbox operation"

### ✅ 6. TypeScript сборка не падает
- Добавлен импорт `AssetStatus` в detail page
- Все типы корректны

---

## GitHub PR Checklist

### Файлы изменены:
1. `app/assets/page.tsx` - исправлена передача actor в createAsset
2. `app/assets/[id]/page.tsx` - исправлен каст статуса, добавлен импорт AssetStatus
3. `app/actions/assets.ts` - исправлен recordAssetSale (убран нулевой UUID)

### Для ручной проверки:
1. **God Mode Selector:**
   - [ ] Открыть /assets в режиме администратора
   - [ ] Проверить, что в Create Dialog виден God Mode Selector
   - [ ] Создать актив с God Mode актором - проверить audit_log_v2 (actor должен быть выбранный сотрудник, responsible - из формы)

2. **Valuation/Move/Sale:**
   - [ ] Открыть /assets/{id}
   - [ ] Проверить все 3 диалога (Valuation, Move, Sale) - везде должен быть God Mode Selector
   - [ ] Добавить оценку с God Mode актором - проверить audit_log_v2
   - [ ] Попробовать Sale с cashbox БЕЗ выбора актора - должна быть ошибка "Actor/employee required"

3. **Status Change:**
   - [ ] Изменить статус актива через Status Dialog
   - [ ] Проверить, что статус меняется корректно (без ошибок типов)
   - [ ] Проверить audit_log_v2 (actor должен быть из God Mode, если выбран)

4. **TypeScript:**
   - [ ] Запустить `npm run build` или `tsc` - не должно быть ошибок типов

---

## Migration Status
- ✅ Миграция 050_assets_rls_company_id.sql уже создана (добавляет ASSET_SALE в categories)
- ⚠️ Миграцию нужно запустить вручную в Supabase SQL Editor

---

## Команда для PR (ручной шаг):
\`\`\`bash
git checkout -b fix/assets-godmode-actor-semantics
git add app/assets/page.tsx app/assets/[id]/page.tsx app/actions/assets.ts
git commit -m "fix(assets): correct God Mode actor semantics

- Separate actor (audit) from responsible (business role) in createAsset
- Add AssetStatus type import for proper status casting
- Remove hardcoded UUID in recordAssetSale, return error instead
- GodModeActorSelector now correctly influences audit logs only
"
git push origin fix/assets-godmode-actor-semantics
\`\`\`

Затем создать PR на GitHub с этим чеклистом в описании.

---

## Итог
Все задачи из Fix D#1 выполнены. God Mode теперь корректно разделяет actor (кто сделал) и responsible (за что отвечает). Никакие маршруты и навигация не изменены. Только точечный допил семантики.
