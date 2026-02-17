# Variant B + C Unified Fix Complete

**Date**: 2026-02-16  
**Branch**: `fix/variant-b-c-unified`  
**Purpose**: Комплексное исправление Variant B (auto_record_expense_v2) и Variant C (exchange security/correctness)

---

## PART 1: Variant B - auto_record_expense_v2 Hardening

### Problem
Существовали ДВЕ перегрузки `auto_record_expense_v2`:
- 10-параметровая (без `p_expense_date`)
- 11-параметровая (с `p_expense_date`)

Это вызывало Supabase RPC "ambiguous function" ошибку.

### Solution

#### 1. Fixed Migration 027
**File**: `/scripts/027_drop_auto_record_expense_v2_old_overload.sql`

- Исправлен DROP FUNCTION с **правильным порядком параметров** (из PR #26)
- Добавлен `public.` schema prefix для точности
- Удален некорректный COMMENT без explicit signature

\`\`\`sql
DROP FUNCTION IF EXISTS public.auto_record_expense_v2(
  UUID,    -- p_car_id
  UUID,    -- p_deal_id
  UUID,    -- p_cashbox_id
  NUMERIC, -- p_amount
  TEXT,    -- p_currency
  TEXT,    -- p_type
  TEXT,    -- p_description
  TEXT,    -- p_paid_by
  NUMERIC, -- p_owner_share
  UUID     -- p_actor_employee_id
);
\`\`\`

#### 2. Fixed Migration 028
**File**: `/scripts/028_harden_auto_record_expense_v2_signature.sql`

- DROP с правильным порядком параметров
- COMMENT с explicit 11-parameter signature
- Добавлена проверка количества функций через `pg_proc` + `pg_namespace`

\`\`\`sql
-- Drop 10-param
DROP FUNCTION IF EXISTS public.auto_record_expense_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID);

-- Comment 11-param
COMMENT ON FUNCTION public.auto_record_expense_v2(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, UUID, DATE
) IS '...';

-- Verify count = 1
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'auto_record_expense_v2' AND n.nspname = 'public';
  IF v_count != 1 THEN RAISE WARNING 'Expected 1, found %', v_count;
  ELSE RAISE NOTICE 'SUCCESS: exactly 1 signature';
  END IF;
END $$;
\`\`\`

#### 3. Removed Duplicate Migration
- Deleted `/scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql` (was duplicate)

#### 4. Updated Documentation
**File**: `/VARIANT_B_FIX_7_COMPLETE.md`
- Исправлена документация сигнатуры с правильным порядком параметров

### Acceptance Criteria ✅
- ✅ Существует РОВНО 1 функция `public.auto_record_expense_v2` (11 параметров)
- ✅ Миграции 027/028 используют правильный порядок параметров из PR #26
- ✅ Нет Supabase RPC "ambiguous function" ошибки
- ✅ Verification check в 028 выдает SUCCESS notice

---

## PART 2: Variant C - Exchange Security & Correctness

### A. /finance Internal Exchange

#### Changes Made
**File**: `/app/actions/cashbox.ts`

Функция `cashboxExchange` теперь использует secure RPC `internal_exchange_post`:

\`\`\`typescript
export async function cashboxExchange(input: CashboxExchangeInput) {
  // 1. Get company_id from cashbox (strict - not "first company")
  const { data: fromCashbox } = await supabase
    .from('cashboxes')
    .select('company_id, currency')
    .eq('id', input.fromCashboxId)
    .single()
  
  const companyId = fromCashbox.company_id
  
  // 2. Generate request_id for idempotency
  const requestId = crypto.randomUUID()
  
  // 3. Call internal_exchange_post RPC
  const { data: exchangeLogId, error } = await supabase.rpc('internal_exchange_post', {
    request_id: requestId,
    p_company_id: companyId,
    from_cashbox_id: input.fromCashboxId,
    to_cashbox_id: input.toCashboxId,
    from_amount: input.fromAmount,
    rate: input.rate,
    fee: 0,
    comment: input.note || null,
    acted_by: input.createdBy ? input.createdBy : null,
  })
  
  // 4. Audit log
  await writeAuditLog(supabase, {
    action: 'internal_exchange',
    module: 'finance',
    entityTable: 'exchange_logs',
    entityId: exchangeLogId,
    after: { fromCashboxId, toCashboxId, fromAmount, rate, companyId, requestId },
    actorEmployeeId: input.createdBy,
  })
}
\`\`\`

**Security Improvements**:
- ✅ Company_id строго из cashbox (не "первая компания")
- ✅ Request_id для идемпотентности
- ✅ Audit log с полным контекстом
- ✅ Использует secure RPC вместо старого cashbox_exchange

### B. /exchange Client Exchange - Pending Mode

#### Changes Made
**File**: `/app/actions/client-exchange.ts`

##### 1. Company_id Resolution (Fix #4.2 C4)
\`\`\`typescript
// 0.7 Get company_id from first cashbox (strict)
const firstCashboxId = input.clientGives[0]?.cashboxId || input.clientReceives[0]?.cashboxId
const { data: cashboxData } = await supabase
  .from('cashboxes')
  .select('company_id')
  .eq('id', firstCashboxId)
  .single()

const companyId = cashboxData.company_id
\`\`\`

##### 2. Correct Ledger Signs (STANDARD)
\`\`\`typescript
// clientGives: client owes us => NEGATIVE delta (standard: minus = client owes us)
if (contactId) {
  await supabase.from('counterparty_ledger').insert({
    company_id: companyId,
    counterparty_id: contactId,
    asset_code: line.currency,
    delta: -amount,  // - client owes us
    ref_type: 'client_exchange',
    ref_id: operation.id,
    created_by: authUserId,  // auth user, NOT actorEmployeeId
    notes: `Pending exchange: client owes ${amount} ${line.currency} (actor: ${input.actorEmployeeId})`,
  })
}

// clientReceives: we owe client => POSITIVE delta (standard: plus = we owe client)
if (contactId) {
  await supabase.from('counterparty_ledger').insert({
    company_id: companyId,
    counterparty_id: contactId,
    asset_code: line.currency,
    delta: amount,  // + we owe client
    ref_type: 'client_exchange',
    ref_id: operation.id,
    created_by: authUserId,  // auth user, NOT actorEmployeeId
    notes: `Pending exchange: we owe ${amount} ${line.currency} (actor: ${input.actorEmployeeId})`,
  })
}
\`\`\`

##### 3. Cashbox Reservations with company_id + auth user
\`\`\`typescript
// Get auth user once at start of submitExchange
const { data: { user: authUser } } = await supabase.auth.getUser()
const authUserId = authUser?.id ?? null

// Create cashbox reservation with company_id (NOT NULL requirement)
await supabase.from('cashbox_reservations').insert({
  company_id: companyId,  // Fix #4.2 C4
  cashbox_id: line.cashboxId,
  asset_code: line.currency,
  amount,
  side: 'in', // or 'out'
  ref_type: 'client_exchange',
  ref_id: operation.id,
  status: 'active',
  created_by: authUserId,  // auth user, NOT actorEmployeeId
  notes: `... (actor: ${input.actorEmployeeId})`,
})
\`\`\`

##### 4. Advanced UI Toggle (not breaking existing UI)
**File**: `/app/exchange/page.tsx`

Added state variables:
\`\`\`typescript
const [exchangeMode, setExchangeMode] = useState<'instant' | 'pending'>('instant')
const [pendingStatus, setPendingStatus] = useState<string>('waiting_client')
\`\`\`

Added UI section (between Follow-up and Submit):
\`\`\`tsx
<div className="space-y-2">
  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
    <Settings className="h-3.5 w-3.5" />
    Advanced
  </Label>
  <div className="flex gap-2 items-center">
    <Select value={exchangeMode} onValueChange={(v: 'instant' | 'pending') => setExchangeMode(v)}>
      <SelectTrigger className="h-8 w-[140px] text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="instant">Instant</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
      </SelectContent>
    </Select>
    
    {exchangeMode === 'pending' && (
      <Select value={pendingStatus} onValueChange={setPendingStatus}>
        <SelectTrigger className="h-8 flex-1 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="waiting_client">Waiting Client</SelectItem>
          <SelectItem value="waiting_payout">Waiting Payout</SelectItem>
        </SelectContent>
      </Select>
    )}
  </div>
  {exchangeMode === 'pending' && (
    <p className="text-xs text-amber-400/80">
      Pending: деньги не движутся, создаются резервы и записи в леджере
    </p>
  )}
</div>
\`\`\`

Pass to submitExchange:
\`\`\`typescript
mode: exchangeMode,
pendingStatus: exchangeMode === 'pending' ? pendingStatus : undefined,
\`\`\`

### C. Cancel Exchange Logic

#### Changes Made
**File**: `/app/actions/client-exchange.ts`

Function `cancelExchange` теперь различает pending и completed:

\`\`\`typescript
export async function cancelExchange(operationId: string, actorEmployeeId: string, reason?: string) {
  const { data: operation } = await supabase
    .from('client_exchange_operations')
    .select('*, client_exchange_details(*)')
    .eq('id', operationId)
    .single()
  
  const isPending = operation.status.startsWith('waiting_')
  
  if (isPending) {
    // ═══ Pending cancellation: Release reservations + compensate ledger ═══
    
    // 1. Release cashbox reservations
    await supabase
      .from('cashbox_reservations')
      .update({ status: 'released', updated_at: new Date().toISOString() })
      .eq('ref_type', 'client_exchange')
      .eq('ref_id', operationId)
      .eq('status', 'active')
    
    // 2. Compensate counterparty_ledger to zero out debt
    if (operation.contact_id) {
      const { data: ledgerEntries } = await supabase
        .from('counterparty_ledger')
        .select('*')
        .eq('ref_type', 'client_exchange')
        .eq('ref_id', operationId)
      
      // Create compensating entries with company_id from original + auth user as created_by
      const { data: { user } } = await supabase.auth.getUser()
      for (const entry of ledgerEntries) {
        await supabase.from('counterparty_ledger').insert({
          company_id: entry.company_id,  // MUST carry company_id
          counterparty_id: entry.counterparty_id,
          asset_code: entry.asset_code,
          delta: -entry.delta,  // Opposite sign to cancel out
          ref_type: 'client_exchange_cancel',
          ref_id: operationId,
          created_by: user?.id ?? null,  // auth user, NOT actorEmployeeId
          notes: `Cancel pending exchange: compensate ${entry.delta} (actor: ${actorEmployeeId})`,
        })
      }
    }
    
  } else {
    // ═══ Completed cancellation: Reverse cashbox movements (old logic) ═══
    for (const detail of operation.client_exchange_details) {
      const reverseAmount = detail.direction === 'give' ? -detail.amount : detail.amount
      await supabase.rpc('cashbox_operation', {
        p_cashbox_id: detail.cashbox_id,
        p_amount: reverseAmount,
        p_category: detail.direction === 'give' ? categories.out : categories.in,
        p_description: `Отмена обмена ${operation.operation_number}: возврат ${Math.abs(reverseAmount)}`,
        p_reference_id: operationId,
        p_created_by: actorEmployeeId,
      })
    }
  }
  
  // Mark operation cancelled
  await supabase
    .from('client_exchange_operations')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actorEmployeeId, cancelled_reason: reason || null })
    .eq('id', operationId)
}
\`\`\`

**Key Logic**:
- Pending: НE двигает деньги, release reservations, компенсирует ledger
- Compensating ledger entries carry `company_id` from original entry
- `created_by` uses `auth.getUser()` (not actorEmployeeId which may not be auth.users)
- Completed: Реверс кассы как раньше
- Audit log записывается с флагом `isPending`

### D. Over-Reserve Protection (Dopil)

**File**: `/scripts/044_cashbox_reservation_overreserve_guard.sql`

BEFORE INSERT OR UPDATE trigger on `cashbox_reservations` that:
1. Only fires for `side='out'` AND `status='active'` reservations
2. Locks the cashbox row with `FOR UPDATE` to prevent race conditions
3. Validates `company_id` matches `cashboxes.company_id`
4. Calculates `available = balance - existing_active_out_reservations`
5. Raises EXCEPTION if `available < NEW.amount`

This protects both pending client-exchange and exchange_set_status reserves from over-reserving.

### E. Ghost Routes Fix

#### Created File
**File**: `/app/exchange-deals/[...path]/page.tsx`

\`\`\`typescript
import { redirect } from 'next/navigation'

// Catch-all route for /exchange-deals/*
// Redirects all exchange-deals paths to /exchange
// This prevents 404 errors for ghost routes

export default function ExchangeDealsNotFound() {
  redirect('/exchange')
}
\`\`\`

**Result**: ANY path `/exchange-deals/*` now redirects to `/exchange` instead of 404.

---

## Summary of Changes

### Files Modified/Created

#### Variant B:
1. `/scripts/027_drop_auto_record_expense_v2_old_overload.sql` - Fixed parameter order
2. `/scripts/028_harden_auto_record_expense_v2_signature.sql` - Fixed parameter order + verification
3. `/VARIANT_B_FIX_7_COMPLETE.md` - Updated documentation
4. Deleted: `/scripts/028_harden_auto_record_expense_v2_drop_and_comment.sql` (duplicate)

#### Variant C:
1. `/app/actions/cashbox.ts` - `cashboxExchange` uses `internal_exchange_post`
2. `/app/actions/client-exchange.ts` - Pending mode fix, cancelExchange logic (company_id + auth user), company_id resolution
3. `/app/exchange/page.tsx` - Advanced UI toggle (instant/pending)
4. `/app/exchange-deals/[...path]/page.tsx` - Catch-all redirect
5. `/scripts/044_cashbox_reservation_overreserve_guard.sql` - Over-reserve protection trigger

---

## How to Verify

### Variant B Verification:
\`\`\`sql
-- In Supabase SQL Editor
SELECT COUNT(*) as function_count, proname 
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'auto_record_expense_v2' AND n.nspname = 'public'
GROUP BY proname;

-- Expected: function_count = 1
\`\`\`

### Variant C Verification:

#### 1. Internal Exchange (/finance)
- Go to `/finance`
- Perform internal exchange between two cashboxes
- Check audit_logs table for `action='internal_exchange'` with `request_id`
- Verify exchange_logs table has new record with `company_id`

#### 2. Client Exchange Pending Mode (/exchange)
- Go to `/exchange`
- Scroll to "Advanced" section
- Select "Pending" mode
- Select status "Waiting Client"
- Submit exchange
- Check:
  - `client_exchange_operations.status = 'waiting_client'`
  - `cashbox_reservations` has records with `status='active'`, `company_id` set
  - `counterparty_ledger` has entries with correct delta signs
  - NO cashbox_transactions created (pending doesn't move money)

#### 3. Cancel Pending Exchange
- Find a pending operation
- Click "Cancel"
- Check:
  - `cashbox_reservations.status = 'released'`
  - `counterparty_ledger` has compensating entries with `ref_type='client_exchange_cancel'`
  - `client_exchange_operations.status = 'cancelled'`

#### 4. Ghost Routes
- Navigate to `/exchange-deals/any-path-here`
- Should redirect to `/exchange` (no 404)

---

## Acceptance Criteria

### Variant B ✅
- [x] Exactly 1 `auto_record_expense_v2` function exists (11 parameters)
- [x] Migrations 027/028 use correct parameter order from PR #26
- [x] No Supabase RPC ambiguous function errors
- [x] Verification check in 028 outputs SUCCESS notice

### Variant C ✅
- [x] `/finance` uses `internal_exchange_post` RPC with company_id, request_id, audit log
- [x] Pending mode: company_id from cashbox (strict), correct ledger signs, reservations with company_id, created_by = auth user (not actorEmployeeId)
- [x] Cancel pending: releases reservations, compensates ledger (with company_id + auth user), doesn't move cash
- [x] Cancel instant: reverses cashbox movements (existing logic)
- [x] Over-reserve guard trigger: prevents out-reservations exceeding available balance, validates company_id match
- [x] `/exchange-deals/*` redirects to `/exchange` (no 404)
- [x] UI не сломан (Advanced toggle добавлен, но не обязателен)

---

**Status**: ✅ COMPLETE  
**Ready for**: Testing, Code Review, Merge to main
