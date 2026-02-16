# Fix #4: Internal & Client Exchange Separation

This fix implements a secure separation between internal exchange (between company cashboxes) and client exchange (with counterparties) with proper reservation, settlement, and audit trail systems.

## What's Changed

### 1. Route Audit System
- **ROUTES.md**: Complete inventory of all application routes
- **scripts/route-audit.ts**: Automated script to scan and update route inventory
- **Ghost Routes**: `/exchange-deals/*` routes now redirect to `/exchange`
- **npm scripts**:
  - `npm run route-audit`: Update ROUTES.md
  - `npm run route-check`: CI check for route inventory (fails if ROUTES.md is out of date)

### 2. Database Schema

#### New Tables

**exchange_statuses** (037_exchange_statuses.sql)
- Configurable status system for exchange deals
- Each status has flags controlling behavior:
  - `reserve_in`: Reserve incoming assets
  - `reserve_out`: Reserve outgoing assets
  - `allow_settle_in/out`: Allow settlement operations
  - `terminal_success/fail`: Mark as final state
- Default statuses: `draft`, `waiting_client`, `waiting_payout`, `completed`, `failed`, `cancelled`

**cashbox_reservations** (038_cashbox_reservations.sql)
- Track reserved (held) funds in cashboxes
- Supports `active`, `released`, `settled` states
- Enforces uniqueness per reference
- Helper functions:
  - `cashbox_reserved_sum(cashbox_id)`: Get total reserved amount
  - `cashbox_available_balance(cashbox_id)`: Get available balance (balance - reserved)
- View: `cashbox_balances_with_reserved` for quick lookups

**counterparty_ledger** (039_counterparty_ledger.sql)
- Tracks mutual debts/obligations with counterparties
- Convention: **+delta = we owe them**, **-delta = they owe us**
- Helper functions:
  - `counterparty_balance(company_id, counterparty_id, asset_code)`: Net balance
  - `counterparty_total_balances(company_id, counterparty_id)`: All asset balances
- View: `counterparty_balances_summary` for dashboard views

### 3. RPC Functions

**internal_exchange_post** (040_internal_exchange_post.sql)
- Atomic internal exchange between company's own cashboxes
- Used by `/finance` route
- Features:
  - Idempotency via `request_id`
  - FOR UPDATE locking for atomicity
  - Available balance check (balance - reserved)
  - Automatic audit logging
  - Rollback safety

**exchange_apply_settlement** (041_client_exchange_settlement.sql)
- Apply actual payment to exchange leg
- Updates `amount_settled` on leg
- Creates counterparty ledger entry
- Marks reservations as `settled`

**exchange_set_status** (042_client_exchange_status_change.sql)
- Change exchange deal status
- Automatically manages reservations based on status flags
- Terminal success: Validates full settlement
- Terminal fail: Releases active reservations
- Includes audit logging

### 4. Server Actions

New wrapper functions in `/app/actions/exchange.ts`:

```typescript
// Internal exchange (for /finance)
await internalExchangePost({
  requestId: crypto.randomUUID(),
  fromCashboxId,
  toCashboxId,
  fromAmount,
  rate,
  fee,
  comment
})

// Client exchange settlement
await applySettlement(dealId, legId, transactionId)

// Status management
await setExchangeStatus(dealId, 'completed')

// Get available statuses
await getExchangeStatuses()
```

## Migration Instructions

### Step 1: Execute Database Migrations

Run migrations in order using your Supabase dashboard or SQL editor:

```bash
# In Supabase SQL Editor, run each file in order:
1. scripts/037_exchange_statuses.sql
2. scripts/038_cashbox_reservations.sql
3. scripts/039_counterparty_ledger.sql
4. scripts/040_internal_exchange_post.sql
5. scripts/041_client_exchange_settlement.sql
6. scripts/042_client_exchange_status_change.sql
```

### Step 2: Update Route Inventory

```bash
npm run route-audit
```

### Step 3: Add CI Check (Optional)

Add to your CI pipeline:

```yaml
- name: Check route inventory
  run: npm run route-check
```

## Usage Examples

### Internal Exchange (/finance)

```typescript
import { internalExchangePost } from '@/app/actions/exchange'

const result = await internalExchangePost({
  requestId: crypto.randomUUID(), // For idempotency
  fromCashboxId: usdCashboxId,
  toCashboxId: eurCashboxId,
  fromAmount: 1000,
  rate: 0.92,
  fee: 5,
  comment: 'Monthly EUR purchase'
})

if (result.success) {
  console.log('Exchange completed:', result.exchangeLogId)
}
```

### Client Exchange with Settlement (/exchange)

```typescript
// 1. Create exchange deal (existing functionality)
const deal = await createExchangeDeal({
  dealDate: new Date().toISOString(),
  status: 'draft',
  legs: [
    { direction: 'in', assetCode: 'USD', amount: 1000, ... },
    { direction: 'out', assetCode: 'EUR', amount: 920, ... }
  ]
})

// 2. Change status to activate reservations
await setExchangeStatus(deal.dealId, 'waiting_client')
// This creates reservations for outgoing leg (EUR)

// 3. Client pays (create transaction manually or via payment system)
const txId = '...' // transaction_id from transactions table

// 4. Apply settlement
await applySettlement(deal.dealId, inLegId, txId)
// This updates counterparty ledger and marks reservation as settled

// 5. Complete the deal
await setExchangeStatus(deal.dealId, 'completed')
// This releases all reservations and finalizes the deal
```

### Check Available Balance

```sql
-- In Supabase SQL Editor or via RPC
SELECT cashbox_available_balance('cashbox-uuid-here');

-- Or use the view
SELECT * FROM cashbox_balances_with_reserved
WHERE company_id = 'company-uuid';
```

### Check Counterparty Balance

```sql
-- Get specific asset balance
SELECT counterparty_balance(
  'company-uuid',
  'client-uuid',
  'USD'
);
-- Positive = we owe them
-- Negative = they owe us

-- Get all balances
SELECT * FROM counterparty_total_balances(
  'company-uuid',
  'client-uuid'
);
```

## Architecture Notes

### Internal vs Client Exchange

- **Internal** (`/finance`): Between company's own cashboxes, instant atomic operations
- **Client** (`/exchange`): With external counterparties, requires multi-step workflow with reservations

### Reservation Workflow

1. **Draft**: No reservations, deal can be freely edited
2. **Waiting Client**: Reserve outgoing funds (we're holding money to send)
3. **Waiting Payout**: Reserve both directions, allow settlements
4. **Completed/Failed**: Release all reservations

### Safety Features

- **Idempotency**: `internal_exchange_post` uses `request_id` to prevent duplicates
- **Locking**: FOR UPDATE on cashboxes prevents race conditions
- **Available Balance**: All operations check `balance - reserved`
- **Audit Trail**: Every operation logged in `audit_events`
- **RLS**: Row Level Security enforces company isolation

## Testing Checklist

- [ ] Run `npm run route-audit` successfully
- [ ] Execute all 6 migrations in Supabase
- [ ] Verify `/exchange-deals/*` redirects to `/exchange`
- [ ] Test internal exchange with available balance check
- [ ] Test client exchange with status transitions
- [ ] Verify reservations are created/released correctly
- [ ] Check counterparty ledger entries
- [ ] Validate RLS policies work correctly

## Troubleshooting

### "Insufficient available balance" error
- Check `cashbox_balances_with_reserved` view
- Look for active reservations: `SELECT * FROM cashbox_reservations WHERE cashbox_id = '...' AND status = 'active'`
- Release stale reservations if needed

### Migrations fail
- Ensure all previous migrations (001-036) are applied
- Check table dependencies (companies, cashboxes, contacts must exist)
- Verify RLS is enabled on auth.users table

### Ghost routes not redirecting
- Clear Next.js cache: `rm -rf .next`
- Restart dev server
- Check browser doesn't have cached redirect

## Future Enhancements

- [ ] Add UI for managing exchange statuses
- [ ] Implement automatic reservation cleanup for expired deals
- [ ] Add counterparty balance dashboard widget
- [ ] Create settlement reconciliation report
- [ ] Add webhook notifications for status changes
