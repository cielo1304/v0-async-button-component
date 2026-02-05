# B3 ERP - Контекст проекта

## Обзор
Мультимодульная ERP-система для управления бизнесом: обмен валют, автоплощадка, сделки, склад, HR/зарплаты.

**Стек:** Next.js 16 (App Router), Supabase (PostgreSQL + Auth), TypeScript, Tailwind CSS, shadcn/ui

---

## Архитектура модулей

### 1. EXCHANGE (Обмен валют)
**Страница:** `/app/exchange/page.tsx`
**Компоненты:** `components/exchange/*`, `components/finance/*`
**Actions:** `app/actions/exchange.ts`, `app/actions/currency-rates.ts`, `app/actions/cashbox.ts`

**Функционал:**
- Мультивалютный обмен N→M (RUB, USD, EUR, USDT)
- Автоматические курсы через API + ручная настройка маржи
- Клиентские операции с привязкой к контактам
- История операций, калькулятор прибыли

**Ключевые таблицы:** `exchange_rates`, `client_exchange_operations`, `client_exchange_details`, `exchange_settings`, `currency_rate_sources`

---

### 2. AUTO (Автоплощадка)
**Страница:** `/app/cars/page.tsx`, `/app/cars/[id]/page.tsx`
**Компоненты:** `components/auto-platform/*`, `components/cars/*`

**Функционал:**
- Учет автомобилей (статусы: IN_STOCK, RESERVED, SOLD, PREP, IN_TRANSIT)
- Сделки: продажа, комиссия, рассрочка, аренда
- Клиенты автоплощадки (покупатели, продавцы, арендаторы)
- Trade-in, инспекции, расходы на авто
- Медиа-файлы (фото, документы)

**Ключевые таблицы:** `cars`, `auto_deals`, `auto_clients`, `auto_payments`, `auto_expenses`, `auto_inspections`, `auto_trades`, `auto_media`

---

### 3. DEALS (Сделки)
**Страница:** `/app/deals/page.tsx`, `/app/deals/[id]/page.tsx`
**Компоненты:** `components/deals/*`

**Функционал:**
- Управление сделками (статусы: NEW, IN_PROGRESS, PENDING_PAYMENT, PAID, COMPLETED, CANCELLED)
- Платежи по сделкам (предоплата, частичная, финальная, возврат)
- Привязка к автомобилям и контактам
- Расчет маржи

**Ключевые таблицы:** `deals`, `deal_payments`

---

### 4. STOCK (Склад)
**Страница:** `/app/stock/page.tsx`, `/app/stock/[id]/page.tsx`
**Компоненты:** `components/stock/*`

**Функционал:**
- Товары с SKU, категориями, единицами измерения
- Партионный учет (FIFO)
- Движения: закупка, продажа, списание, корректировка, перемещение
- Минимальные остатки, средняя цена закупки

**Ключевые таблицы:** `stock_items`, `stock_batches`, `stock_movements`

---

### 5. FINANCE (Финансы/Кассы)
**Страница:** `/app/finance/page.tsx`, `/app/finance/[id]/page.tsx`
**Компоненты:** `components/finance/*`

**Функционал:**
- Кассы по типам: CASH, BANK, CRYPTO, TRADE_IN
- Мультивалютность (RUB, USD, EUR, USDT)
- Операции: пополнение, снятие, обмен, перевод
- Локации касс
- Транзакции с категориями

**Ключевые таблицы:** `cashboxes`, `transactions`, `cashbox_locations`, `exchange_log`

---

### 6. HR (Сотрудники/Зарплаты)
**Страница:** `/app/hr/page.tsx`, `/app/hr/[id]/page.tsx`
**Компоненты:** `components/hr/*`, `components/team/*`

**Функционал:**
- Карточки сотрудников (ФИО, должность, контакты)
- Зарплатный баланс и операции (начисление, выплата, бонус, штраф, аванс)
- Привязка к модулям (exchange, deals, auto)
- RBAC через employee_roles

**Ключевые таблицы:** `employees`, `salary_operations`, `employee_roles`, `employee_invites`

---

### 7. CONTACTS (Единая база клиентов)
**Страница:** `/app/contacts/page.tsx`, `/app/contacts/[id]/page.tsx`

**Функционал:**
- Единая карточка клиента для всех модулей
- Каналы связи (телефоны, email) с нормализацией
- Сегменты по модулям (exchange, deals, auto)
- Чувствительные данные (паспорт, права) с отдельным доступом
- История событий (timeline)

**Ключевые таблицы:** `contacts`, `contact_channels`, `contact_segments`, `contact_sensitive`, `contact_events`

---

## Система доступа (RBAC)

### Архитектура
- **Feature flag:** `NEXT_PUBLIC_ACCESS_CONTROL_ENABLED` (по умолчанию false = "Глаз Бога")
- **Source of truth:** `employee_roles` (связь сотрудник → роль)
- **Синхронизация:** триггер `sync_employee_roles_to_user_roles` копирует в `user_roles` при наличии `auth_user_id`

### Уровни доступа к модулям
```typescript
type ModuleAccessLevel = 'none' | 'view' | 'work' | 'manage'
type BusinessModule = 'exchange' | 'auto' | 'deals' | 'stock'
```

### Preset роли (12 штук)
- `EXCHANGE_VIEW`, `EXCHANGE_WORK`, `EXCHANGE_MANAGE`
- `AUTO_VIEW`, `AUTO_WORK`, `AUTO_MANAGE`
- `DEALS_VIEW`, `DEALS_WORK`, `DEALS_MANAGE`
- `STOCK_VIEW`, `STOCK_WORK`, `STOCK_MANAGE`

### Системные роли
- `ADMIN` - полный доступ
- `MANAGER` - управление
- `ACCOUNTANT` - бухгалтерия
- `CASHIER` - кассовые операции

### Ключевые функции (lib/access/index.ts)
```typescript
getCurrentEmployeeAccess(supabase, authUserId?) → EmployeeAccessResult
hasAccessLevel(actual, required) → boolean
getModuleAccessLevelFromRoles(roles, module) → ModuleAccessLevel
canReadModule(perms, module) → boolean
```

---

## Ключевые файлы

### Типы
- `/lib/types/database.ts` - все TypeScript интерфейсы

### Константы
- `/lib/constants/currencies.ts` - валюты и форматирование
- `/lib/constants/contacts.ts` - права контактов
- `/lib/constants/team-access.ts` - модули, уровни, preset роли

### Server Actions
- `/app/actions/team.ts` - CRUD сотрудников, роли, приглашения
- `/app/actions/exchange.ts` - операции обмена
- `/app/actions/cashbox.ts` - операции с кассами
- `/app/actions/currency-rates.ts` - управление курсами

### Supabase
- `/lib/supabase/server.ts` - серверный клиент (createClient, createServerClient)
- `/lib/supabase/client.ts` - браузерный клиент

### Миграции
- `scripts/001_create_schema.sql` - базовые таблицы
- `scripts/002_contacts.sql` - модуль контактов
- `scripts/003_contacts_backfill.sql` - миграция данных в контакты
- `scripts/004_team_access.sql` - RBAC, employee_roles, preset роли
- `scripts/auto-platform-migration.sql` - автоплощадка

---

## UI Компоненты

### Основные страницы
| Путь | Назначение |
|------|------------|
| `/` | Дашборд с виджетами |
| `/exchange` | Обмен валют |
| `/cars` | Автоплощадка |
| `/deals` | Сделки |
| `/stock` | Склад |
| `/finance` | Кассы и транзакции |
| `/hr` | Сотрудники и зарплаты |
| `/contacts` | База клиентов |
| `/settings` | Настройки (TeamManager) |
| `/analytics` | Аналитика |

### Ключевые компоненты
- `TeamManager` - управление сотрудниками, ролями, должностями
- `ExchangeRatesManager` - настройка курсов
- `CashboxList` - список касс с операциями
- `CarList`, `DealList`, `StockList` - списки с фильтрами

---

## Валюты и форматирование

```typescript
type Currency = 'RUB' | 'USD' | 'USDT' | 'EUR'

// Символы: ₽, $, ₮, €
// Форматирование через Intl.NumberFormat
```

---

## Особенности

1. **Мультивалютность** - все суммы хранятся в оригинальной валюте + конвертация в USD для отчетов
2. **Партионный учет** - склад использует FIFO через `stock_batches`
3. **Аудит** - история изменений курсов в `exchange_rate_history`
4. **Единый клиент** - `contacts` связывает клиентов из всех модулей через `contact_segments`
5. **HR + RBAC** - сотрудники (`employees`) отделены от пользователей Auth, роли назначаются через `employee_roles`
