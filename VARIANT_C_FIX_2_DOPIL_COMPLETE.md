# Variant C Fix #2 Dopil — Complete ✅

**Дата:** 2026-02-16  
**Цель:** Починить server actions для создания exchange deals, привести payload к RPC формату, убрать некорректный комментарий про RLS.

---

## Что сделано

### 1. ✅ Типы и Server Actions (`app/actions/exchange.ts`)

**Добавлено:**

- `CreateExchangeDealInput` — типизированный input для создания сделки обмена
- `createExchangeDeal(input: CreateExchangeDealInput)` — server action для создания сделки через RPC `exchange_deal_create`
  - Получает текущего пользователя через `supabase.auth.getUser()`
  - Читает `company_id` из `team_members`
  - Преобразует `legs` из camelCase в snake_case для RPC
  - Вызывает `exchange_deal_create` с правильными параметрами
  - Возвращает `{success, dealId, error}`
- `getExchangeDealById(dealId: string)` — server action для получения сделки с legs
  - Читает `exchange_deals.single()` по id
  - Читает `exchange_legs` по deal_id
  - Возвращает `{success, deal, legs, error}`

**Изменено:**

- Убран некорректный комментарий "RLS will filter by company_id automatically" в `getExchangeDeals()`, т.к. сейчас политики `allow-all` для тестирования

**НЕ тронуто:**

- Существующие функции `executeExchange`, `getCurrencyRates`, `fetchExternalRate`, `getExchangeDeals`, `getExchangeLegsByDeal` остались без изменений

---

### 2. ✅ UI страницы

**`/app/exchange-deals/new/page.tsx`:**

- Импорт `createExchangeDeal` и `CreateExchangeDealInput` корректен
- Форма создает сделку с динамическими legs (минимум 2, хотя бы 1 OUT и 1 IN)
- При успехе редиректит на `/exchange-deals/{dealId}`

**`/app/exchange-deals/[id]/page.tsx`:**

- Импорт `getExchangeDealById` корректен
- Отображает детали сделки и все legs с иконками направления

---

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│  UI: /exchange-deals/new                            │
│  Форма с динамическими legs (camelCase)             │
└──────────────┬──────────────────────────────────────┘
               │
               │ createExchangeDeal(input)
               v
┌─────────────────────────────────────────────────────┐
│  app/actions/exchange.ts                            │
│  ✓ Получить user + company_id                      │
│  ✓ Преобразовать legs в snake_case                 │
│  ✓ Вызвать RPC: exchange_deal_create                │
└──────────────┬──────────────────────────────────────┘
               │
               │ RPC: exchange_deal_create(...)
               v
┌─────────────────────────────────────────────────────┐
│  scripts/030_exchange_deal_rpc.sql                  │
│  ✓ Валидация: минимум 2 legs, 1 OUT + 1 IN         │
│  ✓ Атомарная вставка в exchange_deals + legs       │
│  ✓ Возврат deal_id                                  │
└─────────────────────────────────────────────────────┘
```

---

## Валидация

**Client-side (new page):**
- ≥ 2 legs
- ≥ 1 OUT + ≥ 1 IN
- assetCode + amount > 0

**Server-side (RPC):**
- То же самое через SQL CHECK

**Типобезопасность:**
- TypeScript типы соответствуют SQL enum и RPC параметрам

---

## Следующие шаги (опционально)

1. Добавить RLS политики вместо `allow-all` для production
2. Добавить редактирование/удаление сделок
3. Добавить валидацию через кассы (если `cashbox_id` указан — проверить баланс)
4. Добавить автоматический расчет курсов между legs

---

## Файлы изменены

- `app/actions/exchange.ts` — добавлены типы и 2 server actions, убран комментарий про RLS
- `app/exchange-deals/new/page.tsx` — уже корректный импорт
- `app/exchange-deals/[id]/page.tsx` — уже корректный импорт

**Status:** ✅ Complete — все server actions работают, payload преобразован для RPC, UI страницы готовы.
