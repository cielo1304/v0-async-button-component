# Fix #8: Cashbox CRUD через Server Actions + Audit Log + God Mode

**Цель:** Убрать client-правки касс, везде писать audit_log_v2 и дать God-mode actor там, где меняются данные касс (create/edit/delete/sort order).

---

## ИЗМЕНЕНИЯ

### STEP 1: Server Actions в `/app/actions/cashbox.ts`

Добавлены 4 новые server actions:

#### A) `createCashbox(input: CreateCashboxInput)`

**Input:**
```typescript
{
  name: string
  type: string
  currency: string
  initial_balance?: number
  balance?: number
  location?: string | null
  holder_name?: string | null
  holder_phone?: string | null
  is_hidden?: boolean
  is_archived?: boolean
  is_exchange_enabled?: boolean
  actorEmployeeId?: string
}
```

**Логика:**
- Insert в `cashboxes` таблицу
- Запись в `audit_log_v2` (action='cashbox_create', module='finance', after: input, actorEmployeeId)
- revalidatePath('/finance'), revalidatePath('/exchange')
- Возврат: `{ success: true, cashbox }` или `{ success: false, error }`

#### B) `updateCashbox(input: UpdateCashboxInput)`

**Input:**
```typescript
{
  id: string
  patch: {
    name?: string
    type?: string
    location?: string | null
    holder_name?: string | null
    holder_phone?: string | null
    is_hidden?: boolean
    is_archived?: boolean
    is_exchange_enabled?: boolean
  }
  actorEmployeeId?: string
}
```

**Логика:**
- SELECT before state для audit
- UPDATE cashboxes + updated_at=now()
- Запись в `audit_log_v2` (action='cashbox_update', before, after: patch, actorEmployeeId)
- revalidatePath('/finance'), revalidatePath('/exchange')
- Возврат: `{ success: true }` или `{ success: false, error }`

#### C) `deleteCashbox(input: DeleteCashboxInput)`

**Input:**
```typescript
{
  id: string
  actorEmployeeId?: string
}
```

**Логика:**
- **Проверка:** COUNT transactions по cashbox_id
  - Если > 0 → возврат `{ success: false, error: 'Есть N связанных транзакций. Используйте архив.' }`
- DELETE from cashboxes
- Запись в `audit_log_v2` (action='cashbox_delete', entityId, actorEmployeeId)
- revalidatePath('/finance'), revalidatePath('/exchange')
- Возврат: `{ success: true }` или `{ success: false, error }`

#### D) `updateCashboxSortOrders(input: UpdateCashboxSortOrdersInput)`

**Input:**
```typescript
{
  items: Array<{id: string, sort_order: number}>
  actorEmployeeId?: string
}
```

**Логика:**
- **Server-side loop:** для каждого item обновляет sort_order
- Запись в `audit_log_v2` (action='cashbox_sort_order_update_bulk', after: {items}, actorEmployeeId)
- revalidatePath('/finance')
- Возврат: `{ success: true }` или `{ success: false, error }`

---

### STEP 2: AddCashboxDialog (`/components/finance/add-cashbox-dialog.tsx`)

**Изменения:**
1. ✅ Добавлен import: `GodModeActorSelector`, `createCashbox`
2. ✅ Добавлен state: `godmodeActorId` (string | undefined)
3. ✅ В UI добавлен `<GodModeActorSelector value={godmodeActorId} onChange={setGodmodeActorId} />`
4. ✅ `handleSubmit`: Убран client supabase.insert, вместо этого вызов `createCashbox({ ..., actorEmployeeId: godmodeActorId })`
5. ✅ Обработка ошибок: `toast.error(result.error)` если !result.success
6. ✅ После успеха: resetForm + router.refresh + onSuccess()
7. ✅ `resetForm`: добавлено `setGodmodeActorId(undefined)`

**Результат:** Создание кассы теперь через server action с audit log и god-mode actor.

---

### STEP 3: EditCashboxDialog (`/components/finance/edit-cashbox-dialog.tsx`)

**Изменения:**
1. ✅ Добавлен import: `GodModeActorSelector`, `updateCashbox`, `deleteCashbox`
2. ✅ Добавлен state: `godmodeActorId` (string | undefined)
3. ✅ В UI добавлен `<GodModeActorSelector value={godmodeActorId} onChange={setGodmodeActorId} />`
4. ✅ `handleSubmit`: Убран client supabase.update, вместо этого вызов `updateCashbox({ id: cashbox.id, patch: {...}, actorEmployeeId: godmodeActorId })`
5. ✅ `handleDelete`: Убран client check + delete, вместо этого вызов `deleteCashbox({ id: cashbox.id, actorEmployeeId: godmodeActorId })`
6. ✅ Обработка ошибок: server action сам проверяет транзакции и возвращает понятную ошибку "Есть N связанных транзакций"
7. ✅ useEffect: при открытии диалога `setGodmodeActorId(undefined)` для сброса

**Результат:** Редактирование и удаление кассы через server actions с audit log и god-mode actor.

---

### STEP 4: Finance Page Drag & Drop (`/app/finance/page.tsx`)

**Изменения:**
1. ✅ Добавлен import: `updateCashboxSortOrders`
2. ✅ `handleDragEnd`: Убран client loop с supabase.update
3. ✅ Вместо loop: вызов `updateCashboxSortOrders({ items: cashboxes.map((c,i)=>({id:c.id, sort_order:i})) })`
4. ✅ Обработка ошибок: `toast.error(result.error)` если !result.success
5. ✅ После успеха: toast.success('Порядок сохранен')

**Примечание:** actorEmployeeId не передаётся (можно добавить глобальный GodModeActorSelector на странице, но не обязательно - audit всё равно пишется, просто actor будет null)

**Результат:** Drag & drop сохраняет порядок касс через bulk server action с audit log.

---

## ACCEPTANCE CRITERIA

✅ **1) Создание/редактирование/удаление кассы НЕ использует client supabase напрямую**
- Всё через server actions: `createCashbox`, `updateCashbox`, `deleteCashbox`

✅ **2) На create/update/delete/sort order появляется запись в audit_log_v2**
- action='cashbox_create' | 'cashbox_update' | 'cashbox_delete' | 'cashbox_sort_order_update_bulk'
- module='finance'
- entityTable='cashboxes'
- entityId указан (кроме bulk sort order)
- after/before данные записываются
- **Non-blocking:** audit ошибка не блокирует операцию (try-catch в server actions)

✅ **3) В Add/Edit кассы есть выбор God-mode actor**
- Компонент `<GodModeActorSelector>` добавлен в оба диалога
- actorEmployeeId передаётся в server actions и попадает в audit log

✅ **4) /finance drag&drop сохраняет порядок через server action (bulk)**
- `updateCashboxSortOrders` принимает массив items
- Один audit запись с action='cashbox_sort_order_update_bulk' и after={items}
- Никаких client updates в цикле

---

## ТЕСТИРОВАНИЕ

### Создание кассы:
1. Открыть /finance
2. Нажать "Добавить кассу"
3. Заполнить форму (название, тип, валюта, начальный баланс)
4. Выбрать God-mode actor (или оставить пустым)
5. Нажать "Создать кассу"
6. **Ожидаем:** toast "Касса успешно создана", касса появилась в списке, router.refresh() обновил данные
7. **Проверить DB:** запись в audit_log_v2 с action='cashbox_create', module='finance', entityTable='cashboxes', after={input}, actorEmployeeId

### Редактирование кассы:
1. Открыть /finance
2. Нажать шестерёнку на кассе → открывается EditCashboxDialog
3. Изменить поля (название, локация, ответственный, is_hidden, is_archived, is_exchange_enabled)
4. Выбрать God-mode actor
5. Нажать "Сохранить изменения"
6. **Ожидаем:** toast "Касса успешно обновлена", диалог закрыт, router.refresh() обновил данные
7. **Проверить DB:** запись в audit_log_v2 с action='cashbox_update', before={старые значения}, after={новые значения}, actorEmployeeId

### Удаление кассы:
1. Открыть /finance → Edit cashbox dialog
2. Нажать "Удалить" → подтверждение
3. **Если есть транзакции:** toast.error('Есть N связанных транзакций. Используйте архив.')
4. **Если нет транзакций и баланс = 0:** касса удалена, toast "Касса удалена", router.refresh()
5. **Проверить DB:** запись в audit_log_v2 с action='cashbox_delete', entityId, actorEmployeeId

### Drag & Drop сортировка:
1. Открыть /finance
2. Перетащить кассы в новом порядке (drag & drop)
3. Отпустить → должен сработать handleDragEnd
4. **Ожидаем:** toast "Порядок сохранен"
5. **Проверить DB:** запись в audit_log_v2 с action='cashbox_sort_order_update_bulk', after={items: [{id, sort_order}, ...]}
6. Перезагрузить страницу → порядок должен сохраниться

---

## ИЗМЕНЁННЫЕ ФАЙЛЫ

1. `/app/actions/cashbox.ts` - добавлены 4 server actions (createCashbox, updateCashbox, deleteCashbox, updateCashboxSortOrders)
2. `/components/finance/add-cashbox-dialog.tsx` - использует createCashbox + GodModeActorSelector
3. `/components/finance/edit-cashbox-dialog.tsx` - использует updateCashbox + deleteCashbox + GodModeActorSelector
4. `/app/finance/page.tsx` - handleDragEnd использует updateCashboxSortOrders (bulk server action)

---

## AUDIT LOG ПРИМЕРЫ

### Create:
```json
{
  "action": "cashbox_create",
  "module": "finance",
  "entity_table": "cashboxes",
  "entity_id": "uuid-of-new-cashbox",
  "after": {
    "name": "Основная касса USD",
    "type": "BANK",
    "currency": "USD",
    "balance": 10000,
    "initial_balance": 10000,
    "location": "Офис Москва",
    "holder_name": "Иван Иванов",
    "holder_phone": "+7 999 123 45 67",
    "is_hidden": false,
    "is_archived": false,
    "is_exchange_enabled": true
  },
  "actor_employee_id": "uuid-of-actor-or-null",
  "created_at": "2026-02-12T12:34:56.789Z"
}
```

### Update:
```json
{
  "action": "cashbox_update",
  "module": "finance",
  "entity_table": "cashboxes",
  "entity_id": "uuid-of-cashbox",
  "before": {
    "name": "Старое название",
    "is_hidden": false,
    "is_archived": false
  },
  "after": {
    "name": "Новое название",
    "is_hidden": true,
    "is_archived": false
  },
  "actor_employee_id": "uuid-of-actor",
  "created_at": "2026-02-12T12:35:00.000Z"
}
```

### Delete:
```json
{
  "action": "cashbox_delete",
  "module": "finance",
  "entity_table": "cashboxes",
  "entity_id": "uuid-of-deleted-cashbox",
  "actor_employee_id": "uuid-of-actor",
  "created_at": "2026-02-12T12:36:00.000Z"
}
```

### Sort Order Bulk:
```json
{
  "action": "cashbox_sort_order_update_bulk",
  "module": "finance",
  "entity_table": "cashboxes",
  "after": {
    "items": [
      {"id": "uuid-1", "sort_order": 0},
      {"id": "uuid-2", "sort_order": 1},
      {"id": "uuid-3", "sort_order": 2}
    ]
  },
  "actor_employee_id": null,
  "created_at": "2026-02-12T12:37:00.000Z"
}
```

---

## DEPLOYMENT CHECKLIST

1. ✅ Убедиться, что `audit_log_v2` таблица существует в БД (из предыдущих миграций)
2. ✅ Убедиться, что функция `writeAuditLog` в `/lib/audit.ts` существует и работает
3. ✅ Проверить, что `GodModeActorSelector` компонент существует и работает корректно
4. ✅ Deploy всех изменённых файлов
5. ✅ Тестирование: создать/редактировать/удалить кассу, проверить drag&drop, проверить audit_log_v2
6. ✅ Убедиться, что старые client-side updates больше не используются
7. ✅ Проверить, что revalidatePath работает и данные обновляются после операций

---

## NOTES

- **Non-blocking audit:** Все audit записи в try-catch - если audit fail, операция не прерывается, только console.error
- **actorEmployeeId опциональный:** Если не передан (undefined), audit запишет null в actor_employee_id
- **Bulk sort order:** Один audit запись для всех изменений порядка (не N записей)
- **Delete protection:** server action `deleteCashbox` сам проверяет транзакции и возвращает ошибку если есть
- **Client code cleanup:** Все client supabase.insert/update/delete касс удалены, только server actions
- **TypeScript:** Все input типы экспортированы из actions для переиспользования

---

**Fix #8 COMPLETE** ✅
