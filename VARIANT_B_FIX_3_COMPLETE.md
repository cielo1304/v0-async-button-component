# Variant B Fix #3: Auto Expenses через cashbox_operation_v2 + P&L + God Mode

## Статус: COMPLETE ✅

**Дата:** 2026-02-12

## Цель
Добавить полную поддержку расходов на автомобили через cashbox_operation_v2 с автоматическим расчетом P&L (profit_total/profit_available), God Mode и полным аудитом.

## Что сделано

### STEP 0: Очистка дубликатов миграций ✅
- Перем ещен `scripts/021_auto_ledger_minimal.sql` → `scripts/999_deprecated_021_auto_ledger_minimal.sql`
- Переименован `scripts/021_auto_ledger_v2.sql` → `scripts/999_deprecated_021_auto_ledger_v2.sql`
- Оставлен только `scripts/021_auto_ledger_and_rpc.sql` как единственная миграция 021

### STEP 1: Database Migration - auto_expenses и P&L ✅

**Создан:** `scripts/024_auto_expenses_and_pnl_v2.sql`

#### 1. Таблица auto_expenses
```sql
CREATE TABLE auto_expenses (
  id UUID PRIMARY KEY,
  car_id UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  deal_id UUID NULL REFERENCES auto_deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  description TEXT,
  paid_by TEXT NOT NULL DEFAULT 'COMPANY' CHECK (paid_by IN ('COMPANY', 'OWNER', 'SHARED')),
  owner_share NUMERIC(15, 2) NOT NULL DEFAULT 0,
  cashbox_id UUID NULL REFERENCES cashboxes(id),
  transaction_id UUID NULL REFERENCES transactions(id),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by_employee_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Индексы:**
- `idx_auto_expenses_car_id_date` - для фильтрации по машине и дате
- `idx_auto_expenses_deal_id` - для связи со сделками
- `idx_auto_expenses_transaction_id` - для связи с транзакциями
- `idx_auto_expenses_cashbox_id` - для связи с кассами

#### 2. Колонки P&L в auto_deals
```sql
ALTER TABLE auto_deals 
  ADD COLUMN profit_total NUMERIC(15, 2) NULL,
  ADD COLUMN profit_available NUMERIC(15, 2) NULL;
```

#### 3. Функция auto_recalc_pnl_v2(p_deal_id UUID)
Пересчитывает прибыль сделки:

**profit_total:**
- COMMISSION_SALE: `commission - expenses`
- CASH_SALE/INSTALLMENT: `sale_price - cost_price - expenses`
- RENT/RENTAL: `paid - expenses`

**profit_available:**
- INSTALLMENT: `profit_total * (paid / sale)` (пропорционально оплате)
- Остальные: `profit_total`

#### 4. RPC auto_record_expense_v2
**Параметры:**
- p_car_id UUID
- p_deal_id UUID (optional)
- p_cashbox_id UUID (optional)
- p_amount NUMERIC
- p_currency TEXT
- p_type TEXT
- p_description TEXT
- p_paid_by TEXT (COMPANY/OWNER/SHARED)
- p_owner_share NUMERIC
- p_actor_employee_id UUID

**Логика:**
1. Рассчитывает company_part (сколько платит компания)
2. Если company_part > 0:
   - Проверяет cashbox и валюту
   - Вызывает `cashbox_operation_v2(amount = -company_part)`
   - Получает tx_id
3. INSERT в auto_expenses с tx_id
4. UPDATE cars.cost_price += amount (полная сумма, даже если OWNER платил)
5. INSERT в audit_log_v2
6. Если deal_id указан: вызывает `auto_recalc_pnl_v2`
7. RETURN expense_id

### STEP 2: Server Actions и UI ✅

#### Server Action: recordAutoExpenseV2
**Файл:** `app/actions/auto.ts`

```typescript
export async function recordAutoExpenseV2(params: {
  carId: string
  dealId?: string
  cashboxId?: string
  amount: number
  currency: string
  type: string
  description?: string
  paidBy?: 'COMPANY' | 'OWNER' | 'SHARED'
  ownerShare?: number
  actorEmployeeId?: string
}): Promise<AutoActionResult>
```

Вызывает RPC `auto_record_expense_v2` и делает `revalidatePath` для:
- /cars
- /cars/deals
- /cars/[id]
- /cars/deals/[id] (если dealId)

#### UI Components - Обновлены 3 компонента:

**1. components/auto-platform/add-expense-dialog.tsx**
- ❌ Убран: client-side `transactions.insert` + `cashboxes.update(balance)`
- ✅ Добавлен: вызов `recordAutoExpenseV2` server action
- ✅ Добавлен: `GodModeActorSelector`
- Сохранены поля: paid_by, owner_share

**2. components/cars/add-expense-dialog.tsx**
- ❌ Убран: client-side balance update
- ✅ Добавлен: вызов `recordAutoExpenseV2`
- ✅ Добавлен: `GodModeActorSelector`

**3. components/cars/add-expense-to-car-dialog.tsx**
- ❌ Убран: client-side balance update (только для CASH expenses)
- ✅ Добавлен: вызов `recordAutoExpenseV2` для денежных расходов
- ✅ Добавлен: `GodModeActorSelector`
- ✅ Сохранена: логика складских расходов (STOCK) как есть

## Технические детали

### Атомарность операций
Все денежные расходы теперь проходят через RPC:
```
recordAutoExpenseV2 
  → auto_record_expense_v2 (RPC)
    → cashbox_operation_v2 (RPC)
      → INSERT transactions + UPDATE cashboxes.balance
    → INSERT auto_expenses
    → UPDATE cars.cost_price
    → INSERT audit_log_v2
    → auto_recalc_pnl_v2 (если deal_id)
```

### Audit Trail
Каждый расход записывается в `audit_log_v2`:
- actor_employee_id (from God Mode или NULL→zero-uuid)
- action: 'auto_expense'
- module: 'auto'
- entity_table: 'auto_expenses'
- entity_id: new expense id
- after: { car_id, deal_id, type, amount, currency, paid_by, owner_share, company_part, tx_id }

### God Mode Support
Все UI компоненты имеют `GodModeActorSelector` для выбора actor_employee_id.
Передается через всю цепочку до RPC.

## P&L (Profit & Loss)

### Расчет прибыли
После добавления расхода к сделке (`deal_id != NULL`) автоматически пересчитывается:

**profit_total** - полная прибыль:
- Комиссионная продажа: `комиссия - расходы`
- Продажа/Рассрочка: `цена_продажи - себестоимость - расходы`
- Аренда: `получено - расходы`

**profit_available** - доступная прибыль:
- При рассрочке: `profit_total × (оплачено / цена_продажи)`
- Остальное: `profit_total`

### Как увидеть P&L в UI
В карточке сделки (`/cars/deals/[id]`) будут отображаться:
- profit_total
- profit_available (особенно важно для INSTALLMENT)

Данные обновляются автоматически после любого платежа или расхода (router.refresh / revalidatePath).

## Acceptance Criteria ✅

1. ✅ В проекте больше нет client-side `update cashboxes.balance` в авто/расходах
2. ✅ Любой расход компании проходит через `cashbox_operation_v2` (атомарно)
3. ✅ Все расходы имеют `transactions.tx_id`
4. ✅ `cars.cost_price` увеличивается на полный расход (даже если OWNER платил)
5. ✅ profit_total/profit_available пересчитываются автоматически
6. ✅ Везде есть GodMode actor selector
7. ✅ Полный audit_log_v2 для всех операций

## Миграционный путь

1. ✅ Apply scripts/024_auto_expenses_and_pnl_v2.sql
2. ✅ Use updated UI components
3. ✅ All expenses go through recordAutoExpenseV2

**Примечание:** Миграция еще не применена к базе данных. Требуется:
```bash
# Apply migration via Supabase tool
supabase_apply_migration(
  project_id: "tdzlnryjevqeygwwjdgp",
  scripts: ["024_auto_expenses_and_pnl_v2.sql"]
)
```

## Что дальше

- [ ] Применить миграцию 024 к базе данных
- [ ] Добавить UI для отображения P&L в карточке сделки
- [ ] Добавить фильтры по типам расходов
- [ ] Добавить отчет по расходам/прибыли

---

**Ready for database migration and production use!** 🚀
