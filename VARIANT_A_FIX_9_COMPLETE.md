# VARIANT A - FIX #9 COMPLETE ✅

**Задача:** Переписать операции ВНЕСЕНИЕ/ВЫВОД на странице `/finance/[id]` для использования server action `depositWithdraw` вместо client insert/update.

**Дата:** 2026-02-12

---

## Проблема

До Fix #9 компонент `cashbox-operation-dialog.tsx` использовал **client-side Supabase** для операций внесения/вывода:
1. **Client insert** в `transactions` с hardcoded `created_by`
2. **Client update** баланса в `cashboxes`
3. **Нет атомарности** - две операции могли разойтись
4. **Нет audit log** - операции не логировались
5. **Нет God-mode actor** - не было возможности указать, кто выполняет операцию

\`\`\`typescript
// ❌ ПЛОХО (было)
const { error: txError } = await supabase
  .from('transactions')
  .insert({
    cashbox_id: cashbox.id,
    amount: txAmount,
    balance_after: newBalance,
    category: type,
    description: description || null,
    created_by: '00000000-0000-0000-0000-000000000000', // hardcoded!
  })

const { error: cashboxError } = await supabase
  .from('cashboxes')
  .update({ balance: newBalance })
  .eq('id', cashbox.id)
\`\`\`

---

## Решение

### STEP 1: Обновили imports
Убрали `createClient` из `@/lib/supabase/client`, добавили:
\`\`\`typescript
import { depositWithdraw } from '@/app/actions/cashbox'
import { GodModeActorSelector } from '@/components/finance/god-mode-actor-selector'
\`\`\`

### STEP 2: Добавили godmodeActorId state
\`\`\`typescript
const [godmodeActorId, setGodmodeActorId] = useState<string>('')
\`\`\`

### STEP 3: Переписали handleSubmit
Заменили client insert/update на server action:
\`\`\`typescript
const result = await depositWithdraw({
  cashboxId: cashbox.id,
  amount,
  type, // 'DEPOSIT' | 'WITHDRAW'
  description: description || undefined,
  actorEmployeeId: godmodeActorId || undefined,
})

if (!result.success) {
  toast.error(result.error || 'Ошибка при выполнении операции')
  return
}

toast.success(result.message || ...)
// close dialog + reset form
\`\`\`

### STEP 4: Добавили GodModeActorSelector в UI
Перед кнопками "Отмена/Внести/Вывести":
\`\`\`typescript
<GodModeActorSelector
  value={godmodeActorId}
  onChange={setGodmodeActorId}
/>
\`\`\`

---

## Что изменилось

### Файлы изменены
1. **`/components/finance/cashbox-operation-dialog.tsx`** (переписан)
   - Убраны client insert/update
   - Используется `depositWithdraw` server action
   - Добавлен God-mode actor selector

### Новое поведение
1. **Атомарность:** `depositWithdraw` → RPC `cashbox_operation_v2` выполняет:
   - INSERT в `transactions`
   - UPDATE баланса в `cashboxes`
   - Всё в одной транзакции
2. **Audit log v2:** Каждая операция логируется с before/after
3. **God-mode actor:** Пользователь может выбрать, от чьего имени выполняется операция
4. **Валидация:** Проверка валюты ledger (из Fix #7)

---

## Acceptance Criteria ✅

### 1. Client insert/update удалены
- ❌ `supabase.from('transactions').insert`
- ❌ `supabase.from('cashboxes').update`
- ✅ Используется `depositWithdraw` server action

### 2. Операции атомарные
- ✅ Одна транзакция через RPC `cashbox_operation_v2`
- ✅ Balance после операции корректный
- ✅ Нет race conditions

### 3. God-mode actor работает
- ✅ `GodModeActorSelector` в диалоге
- ✅ `actorEmployeeId` передается в server action
- ✅ Audit log пишет actor_employee_id

### 4. Audit log v2 пишется
- ✅ Каждая операция (deposit/withdraw) логируется
- ✅ Пишутся before/after балансы
- ✅ Non-blocking (ошибка audit не ломает операцию)

### 5. UI/UX не сломан
- ✅ `/finance/[id]` продолжает работать
- ✅ После операции вызывается `loadData()` и обновляется список транзакций
- ✅ Toast messages корректные

---

## Пример использования

### Пользователь на /finance/[id]
1. Видит кассу "Основная касса RUB" с балансом 50,000
2. Нажимает "Внести"
3. Диалог открывается:
   - Вводит сумму: 10,000
   - Описание: "Пополнение от клиента"
   - Выбирает actor: "Иванов Иван (Кассир)"
4. Нажимает "Внести"
5. **Backend:**
   - `depositWithdraw` вызывает RPC `cashbox_operation_v2`
   - Создается transaction +10,000
   - Обновляется balance 60,000
   - Пишется audit_log_v2 с actor_employee_id = Иванова
6. **Frontend:**
   - Toast: "Средства внесены"
   - Dialog закрывается
   - `loadData()` обновляет список транзакций
   - Новый баланс: 60,000

---

## Совместимость

### С предыдущими Fixes
- **Fix #6:** Используется `depositWithdraw` из `/app/actions/cashbox.ts` (уже был создан в Fix #6)
- **Fix #7:** RPC `cashbox_operation_v2` использует финальную версию из migration 020
- **Fix #8:** God-mode actor pattern уже добавлен в другие dialogs (add/edit cashbox)

### С существующим кодом
- **`/app/finance/[id]/page.tsx`** НЕ изменен - продолжает использовать `<CashboxOperationDialog cashbox={...} onSuccess={loadData} />`
- **`/components/finance/deposit-withdraw-dialog.tsx`** НЕ затронут (используется на /finance главной странице, возможно тоже нужно переписать в будущем Fix #10?)

---

## Следующие шаги

### Возможные улучшения (Future Fixes)
1. **Fix #10:** Переписать `/components/finance/deposit-withdraw-dialog.tsx` (если есть) на server actions
2. **Fix #11:** Переписать Transfer dialog на server action
3. **Fix #12:** Переписать Exchange dialog на server action

---

## Резюме

Fix #9 завершен успешно. Операции ВНЕСЕНИЕ/ВЫВОД на странице `/finance/[id]` теперь:
- ✅ Атомарные (RPC cashbox_operation_v2)
- ✅ С audit log v2
- ✅ С God-mode actor
- ✅ Без client insert/update

Все критерии приемки выполнены. 🎉
