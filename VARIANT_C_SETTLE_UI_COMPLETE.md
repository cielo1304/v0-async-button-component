# Variant C: Pending UI + Settle In/Out + Status Changes

## Summary

Adds server actions and minimal UI for settling pending client exchange operations.
Operators can now:
- Settle "in" (client pays us) and "out" (we pay client) for pending operations
- Change operation status between pending / waiting_client / waiting_payout / completed
- Cancel operations with proper ledger compensation and reservation release
- Auto-close operations when all obligations are settled

## Files Changed

### Server Actions
- `app/actions/client-exchange.ts`
  - `setClientExchangeStatus()` -- change status with audit trail; delegates to `cancelExchange` for terminal states
  - `settleClientExchangeIn()` -- deposit into cashbox, compensate counterparty ledger, fulfill 'in' reservation, record settlement
  - `settleClientExchangeOut()` -- withdraw from cashbox, compensate counterparty ledger, fulfill 'out' reservation, record settlement
  - `maybeAutoClose()` -- checks if all reservations fulfilled + ledger net ~0, auto-closes operation

### Migration
- `scripts/045_client_exchange_settlements.sql`
  - Creates `client_exchange_settlements` table to track individual settle actions
  - Columns: operation_id, direction (in/out), cashbox_id, currency, amount, comment, actor_employee_id, created_by
  - RLS policies for select (auth users) and insert (authenticated)
  - Indexes on (operation_id) and (operation_id, direction)
  - **Run manually**: `psql` or Supabase SQL editor

### UI
- `components/exchange/exchange-history-list.tsx`
  - New statuses displayed: `waiting_client`, `waiting_payout`, `failed`
  - Table row actions: dropdown menu with status change + cancel (replaces old inline cancel button)
  - Detail dialog: settle in/out buttons per currency, inline settle form (cashbox select filtered by currency, amount, comment), status change dropdown, cancel button
  - Cancel uses `cancelExchange` server action (proper ledger/reservation handling)
  - Settle form validates cashbox currency match and amount > 0

## Security Model

- `created_by` on ledger entries and settlements uses `auth.users.id` (not `actorEmployeeId`)
- `actorEmployeeId` preserved in `notes` for audit trail
- Settle operations use `cashbox_operation` RPC (atomic balance updates)
- Server-side balance check before settle-out
- All actions write audit log entries

## Test Scenarios

### Story 1: Settle a pending exchange (happy path)
1. Create a pending client exchange: client gives 1000 USD, receives 90000 RUB
2. In history, click the operation -> detail dialog opens
3. Click "Prikhod USD" -> select USD cashbox, confirm amount 1000, click "Podtverdit prikhod"
4. Verify: toast success, cashbox balance +1000, counterparty ledger compensated, reservation fulfilled
5. Click "Vydacha RUB" -> select RUB cashbox, confirm amount 90000, click "Podtverdit vydachu"
6. Verify: auto-close triggers, operation status -> completed

### Story 2: Change status + cancel
1. Create a pending exchange
2. In table row, click "..." -> "Ozhidanie klienta" -> status changes to waiting_client
3. Click "..." -> "Otmenit" -> confirm -> operation cancelled, reservations released, ledger compensated

## New ref_types in counterparty_ledger
- `client_exchange_settle_in` -- compensating entry when client pays us
- `client_exchange_settle_out` -- compensating entry when we pay client

---

## DOPIL Fixes (post-review)

### Fix 1: settleOut available funds with other reservations
- Previously: only checked raw `balance < amount`, ignoring other operations' OUT reservations.
- Now: computes `reservedOutOther` (sum of all active OUT reservations EXCEPT our own), then `availableForThis = balance - reservedOutOther`. Returns detailed error with breakdown.

### Fix 2: pending detection in cancelExchange
- Previously: `isPending` only matched `status.startsWith('waiting_')`.
- Now: `isPending = status === 'pending' || status.startsWith('waiting_')`.
- Ensures operations created with status `'pending'` are cancelled via the pending path (no cashbox movements).

### Fix 3: safer reservation fulfillment ordering in settleOut
- Previously: reservation was marked `fulfilled` BEFORE `cashbox_operation` RPC. If RPC failed, reservation was lost.
- Now: `cashbox_operation` executes first. Only after success is the reservation marked `fulfilled`. On RPC failure, reservation remains `active`.

### Fix 4: RLS hardening for settlements (migration 046)
- `scripts/046_harden_client_exchange_settlements_rls.sql`
- Recreates insert policy with `WITH CHECK` requiring `operation_id IN (SELECT id FROM client_exchange_operations)`.
- Prevents inserting settlements for non-existent operations via UUID guessing.

## Acceptance Checklist (manual)

- [ ] Try settleOut when another operation has active OUT reservations on the same cashbox -> should block if balance minus those reservations < amount, with detailed error.
- [ ] Cancel an operation with status `'pending'` (not `'waiting_*'`) -> should NOT perform cashbox movements, only release reservations + compensate ledger.
- [ ] settleOut where cashbox_operation fails (e.g. insufficient funds at DB level) -> reservation should remain `active`, not `fulfilled`.
- [ ] Run `046_harden_client_exchange_settlements_rls.sql` in Supabase SQL editor -> verify insert fails for random UUID operation_id.
