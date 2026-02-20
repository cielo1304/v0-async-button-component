/**
 * Default Exchange Rate Templates
 * 
 * These templates are displayed in the UI when the exchange_rates table is empty.
 * They serve as visual placeholders and quick-start pairs for common currency exchanges.
 * 
 * Template entries have:
 * - isTemplate: true (marks them as non-persisted UI-only entries)
 * - is_active: false (disabled by default)
 * - When a user enables/saves a template, it gets inserted into the DB and becomes a real rate
 */

export interface ExchangeRateTemplate {
  from_currency: string
  to_currency: string
  is_popular?: boolean
  sort_order?: number
}

export const DEFAULT_EXCHANGE_RATE_TEMPLATES: ExchangeRateTemplate[] = [
  // Major fiat pairs
  { from_currency: 'USD', to_currency: 'RUB', is_popular: true, sort_order: 1 },
  { from_currency: 'EUR', to_currency: 'RUB', is_popular: true, sort_order: 2 },
  { from_currency: 'USD', to_currency: 'EUR', is_popular: false, sort_order: 3 },
  
  // Stablecoins
  { from_currency: 'USDT', to_currency: 'RUB', is_popular: true, sort_order: 4 },
  { from_currency: 'USD', to_currency: 'USDT', is_popular: false, sort_order: 5 },
  { from_currency: 'USDT', to_currency: 'EUR', is_popular: false, sort_order: 6 },
  
  // Crypto majors
  { from_currency: 'BTC', to_currency: 'RUB', is_popular: true, sort_order: 7 },
  { from_currency: 'BTC', to_currency: 'USD', is_popular: true, sort_order: 8 },
  { from_currency: 'BTC', to_currency: 'USDT', is_popular: false, sort_order: 9 },
  
  { from_currency: 'ETH', to_currency: 'RUB', is_popular: true, sort_order: 10 },
  { from_currency: 'ETH', to_currency: 'USD', is_popular: true, sort_order: 11 },
  { from_currency: 'ETH', to_currency: 'USDT', is_popular: false, sort_order: 12 },
  
  // Additional common pairs
  { from_currency: 'EUR', to_currency: 'USD', is_popular: false, sort_order: 13 },
  { from_currency: 'GBP', to_currency: 'RUB', is_popular: false, sort_order: 14 },
  { from_currency: 'CNY', to_currency: 'RUB', is_popular: false, sort_order: 15 },
]
