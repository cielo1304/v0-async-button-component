# Variant C: Exchange Core Schema + List Page (Fix #1)

## Цель
Заложить DB-ядро для модуля Exchange и создать минимальный UI для просмотра списка сделок обмена.

## Реализация

### A) Database / Миграции

**scripts/029_exchange_core_schema.sql**
- Создана таблица `exchange_deals` для хранения сделок обмена
  - Поля: id, company_id, created_by, created_at, deal_date, status, comment
  - Статус: 'draft', 'completed', 'cancelled'
  - Индексы: company_id, (company_id, deal_date DESC), status, created_at
  - RLS: включен с политикой "Allow all operations for authenticated users"

- Создана таблица `exchange_legs` для хранения отдельных операций (out/in)
  - Поля: id, company_id, deal_id, created_at, direction, asset_kind, asset_code, amount, cashbox_id, rate, fee
  - Direction: 'out' (от клиента), 'in' (к клиенту)
  - Asset_kind: 'fiat', 'crypto', 'gold', 'other'
  - Индексы: company_id, deal_id, direction, asset_code, cashbox_id
  - RLS: включен с политикой "Allow all operations for authenticated users"
  - Каскадное удаление при удалении deal (ON DELETE CASCADE)

### B) Actions / Queries

**app/actions/exchange.ts** (дополнено)
- Добавлены новые функции в конец существующего файла (не нарушая логику клиентского обмена):
  - `getExchangeDeals()` - получает список сделок обмена с количеством legs для каждой сделки
  - `getExchangeLegsByDeal(dealId)` - получает все legs для конкретной сделки (пока не используется в UI, но готово)
- Типы: `ExchangeDealWithLegs`, `ExchangeLeg`

### C) UI

**app/exchange-deals/page.tsx** (новая страница)
- Минимальный список сделок обмена (read-only)
- Отображает: дату сделки, статус (draft/completed/cancelled), комментарий, количество legs
- Без функций создания/редактирования (будут добавлены позже)
- Suspense для загрузки данных
- Ссылка на существующий клиентский обмен (/exchange)
- Кнопка "Подробнее" для перехода к детальной странице (пока не реализована)

## Статус миграции

**Готово к выполнению:**
1. Запустить миграцию: `scripts/029_exchange_core_schema.sql` в Supabase SQL Editor
2. Проверить создание таблиц и индексов
3. Проверить работу страницы `/exchange-deals`

## Следующие шаги (Fix #2+)
- Форма создания новой сделки обмена
- Страница детальной сделки с legs
- Редактирование и удаление сделок
- Интеграция с cashbox для автоматического обновления балансов

## Совместимость
- Не затрагивает существующий функционал Variant A, B
- Не ломает клиентский обмен валют (/exchange)
- Использует те же паттерны RLS и структуры, что и другие модули
