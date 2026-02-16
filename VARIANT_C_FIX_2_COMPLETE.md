# Variant C - Fix #2: Exchange Deal Creation via RPC + Details Page

## Что сделано

### 1. Database Migration (030)
- **Файл**: `scripts/030_exchange_deal_rpc.sql`
- **Функция**: `public.exchange_deal_create(p_company_id, p_created_by, p_deal_date, p_status, p_comment, p_legs)`
- **Валидация**:
  - Проверяет status ∈ ('draft','completed','cancelled')
  - Проверяет что p_legs массив с минимум 2 элементами
  - Валидирует каждую leg: direction ('out'|'in'), asset_kind, asset_code, amount > 0
  - Гарантирует минимум 1 'out' и 1 'in' операцию
- **Атомарность**: Вся операция выполняется в транзакции
- **Результат**: Возвращает deal_id новой сделки

### 2. Server Actions
- **Файл**: `app/actions/exchange.ts`
- **Новые функции**:
  - `createExchangeDeal(input)` - создает сделку через RPC
  - `getExchangeDealById(dealId)` - получает сделку + legs по ID
- **Улучшения**:
  - Правильная работа с company_id через team_members
  - Трансформация данных в JSONB для RPC
  - Обработка ошибок и revalidation

### 3. UI Components

#### Страница создания: `/app/exchange-deals/new/page.tsx`
- Форма с полями: deal_date, status, comment
- Динамический список legs с возможностью add/remove (минимум 2)
- Каждая leg: direction, asset_kind, asset_code, amount, опционально cashbox_id, rate, fee
- Валидация на клиенте перед отправкой
- Редирект на страницу деталей после успешного создания

#### Страница деталей: `/app/exchange-deals/[id]/page.tsx`
- Шапка сделки: дата, статус, время создания, количество операций, комментарий
- Таблица legs с визуальным разделением OUT/IN
- Отображение всех полей каждой операции
- Кнопка "Назад" для возврата к списку

#### Обновленный список: `/app/exchange-deals/page.tsx`
- Кнопка "Новая сделка" ведет на `/exchange-deals/new`
- Кнопка "Подробнее" ведет на `/exchange-deals/[id]`

## Технические детали

### RPC функция exchange_deal_create
\`\`\`sql
- Валидирует входные данные
- INSERT в exchange_deals
- INSERT всех legs в exchange_legs
- Возвращает deal_id
- Всё атомарно в транзакции
\`\`\`

### Не затронуто
- Кассы и transactions не используются (для совместимости с существующим /exchange)
- Только создание deals + legs без финансовых движений

## Следующие шаги
После выполнения миграции 030 в Supabase:
1. Проверить создание новой сделки через UI
2. Убедиться что валидация работает
3. Проверить страницу деталей
4. Открыть PR: "Variant C: create exchange deal via RPC + details page (Fix #2)"
