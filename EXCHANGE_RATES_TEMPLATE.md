# Exchange Rates Template System

## Overview

The Exchange Rates Template system provides a default set of common currency pairs that are displayed in the UI even when the `exchange_rates` table is empty. This ensures that users always see a starting point and can quickly activate common pairs without manual data entry.

## How It Works

### 1. Template Constants

Default templates are defined in `/lib/constants/exchange-rates.ts`:

```typescript
export const DEFAULT_EXCHANGE_RATE_TEMPLATES: ExchangeRateTemplate[] = [
  { from_currency: 'USD', to_currency: 'RUB', is_popular: true, sort_order: 1 },
  { from_currency: 'EUR', to_currency: 'RUB', is_popular: true, sort_order: 2 },
  { from_currency: 'USDT', to_currency: 'RUB', is_popular: true, sort_order: 4 },
  { from_currency: 'BTC', to_currency: 'RUB', is_popular: true, sort_order: 7 },
  { from_currency: 'ETH', to_currency: 'RUB', is_popular: true, sort_order: 10 },
  // ... more pairs
]
```

### 2. Template Merging

In `ExchangeRatesManager.loadRates()`:

1. Fetch all rates from the `exchange_rates` table
2. For each template pair:
   - If the pair doesn't exist in DB → create a template entry with `isTemplate: true`
   - If the pair exists in DB → use the DB record (template is ignored)
3. Template entries have:
   - `isTemplate: true` - marks them as UI-only
   - `is_active: false` - disabled by default
   - `buy_rate: 0, sell_rate: 0` - placeholder values
   - A special ID: `template-{FROM}-{TO}`

### 3. Template Activation

When a user enables a template rate via the toggle switch:

1. The system detects it's a template (`rate.isTemplate === true`)
2. Fetches the current API rate for the currency pair
3. Creates a real DB record with:
   - API rate as buy_rate
   - Calculated sell_rate based on default margin
   - `is_active: true`
   - Current timestamp
4. On next reload, the template is replaced by the real DB record

### 4. Template Editing

When a user clicks to edit a template rate:

1. The edit dialog opens with the template data
2. The system fetches the latest API rate for the pair
3. If user saves → a new DB record is created (same as activation)
4. Template is replaced by the real record on next load

## Visual Indicators

- Template entries show a "Шаблон" badge in cyan color
- Template entries are disabled (grayed out) by default
- Template entries show 0.0000 for rates until activated

## Database Behavior

### Templates DO NOT:
- Get saved to the `exchange_rates` table
- Trigger rate refresh/update operations
- Appear in history or audit logs
- Affect financial calculations

### Templates DO:
- Appear in the UI alongside real rates
- Become real rates when enabled/saved
- Show up sorted by `sort_order` property
- Provide a quick-start experience

## Adding New Templates

To add more default pairs, edit `/lib/constants/exchange-rates.ts`:

```typescript
export const DEFAULT_EXCHANGE_RATE_TEMPLATES: ExchangeRateTemplate[] = [
  // ... existing templates
  { from_currency: 'GBP', to_currency: 'USD', is_popular: false, sort_order: 16 },
]
```

No database migration needed - templates are code-level only.

## API Integration

When activating a template:
- The system fetches the rate from configured `currency_rate_sources`
- Falls back to the default Exchange Rate API if no source is configured
- If rate fetch fails, the template can still be manually configured

## Workflow Example

1. **Fresh Database**:
   - DB has 0 records
   - UI shows 15 template pairs (all disabled)

2. **User Enables USD/RUB**:
   - System fetches API rate: 92.5 RUB per USD
   - Creates DB record with margin: buy=92.5, sell=94.35 (2% margin)
   - Template disappears, real record appears

3. **User Clears Database**:
   - All records deleted from `exchange_rates`
   - Templates reappear on next page load
   - Common pairs are ready to be re-enabled instantly

## Benefits

- **No empty state**: Users always see common pairs
- **Quick onboarding**: Enable pairs with one click
- **Consistent UX**: Same pairs appear for all tenants
- **Zero maintenance**: No need to seed DB for new tenants
- **Clean separation**: Templates don't pollute the database

## Technical Notes

- Templates use TypeScript type: `ExchangeRateTemplate`
- Extended rate interface includes: `isTemplate?: boolean`
- Templates are filtered out from auto-refresh operations
- Template IDs start with `template-` prefix for easy identification
