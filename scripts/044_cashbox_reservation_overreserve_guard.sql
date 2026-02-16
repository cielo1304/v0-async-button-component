-- =============================================
-- Script 044: Cashbox Reservation Over-Reserve Guard
-- =============================================
-- Prevents creating 'out' reservations that exceed available balance.
-- On INSERT or UPDATE of cashbox_reservations where side='out' AND status='active':
--   1. Locks the cashbox row (FOR UPDATE) to prevent races
--   2. Calculates reserved_out = SUM of other active 'out' reservations
--   3. Checks (balance - reserved_out) >= NEW.amount
--   4. Validates company_id matches cashboxes.company_id

-- ─────────────────────────────────────────────
-- 1. Validation trigger function
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cashbox_reservation_overreserve_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_balance NUMERIC;
  v_cashbox_company_id UUID;
  v_reserved_out NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Only check active 'out' reservations (the ones that reduce available balance)
  IF NEW.status != 'active' OR NEW.side != 'out' THEN
    RETURN NEW;
  END IF;

  -- 1. Lock the cashbox row and get balance + company_id
  SELECT balance, company_id
    INTO v_balance, v_cashbox_company_id
    FROM public.cashboxes
   WHERE id = NEW.cashbox_id
     FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Cashbox % not found', NEW.cashbox_id;
  END IF;

  -- 2. Validate company_id matches
  IF NEW.company_id != v_cashbox_company_id THEN
    RAISE EXCEPTION 'Reservation company_id (%) does not match cashbox company_id (%)',
      NEW.company_id, v_cashbox_company_id;
  END IF;

  -- 3. Sum existing active 'out' reservations, excluding current row on UPDATE
  SELECT COALESCE(SUM(amount), 0)
    INTO v_reserved_out
    FROM public.cashbox_reservations
   WHERE cashbox_id = NEW.cashbox_id
     AND status = 'active'
     AND side = 'out'
     AND id IS DISTINCT FROM NEW.id;  -- Exclude self on UPDATE

  -- 4. Check available balance
  v_available := v_balance - v_reserved_out;

  IF v_available < NEW.amount THEN
    RAISE EXCEPTION 'Insufficient available balance for reservation: balance=%, reserved=%, available=%, requested=%',
      v_balance, v_reserved_out, v_available, NEW.amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.cashbox_reservation_overreserve_guard() IS
  'BEFORE trigger: prevents out-reservations exceeding available cashbox balance. Locks cashbox row to prevent races.';

-- ─────────────────────────────────────────────
-- 2. Attach trigger
-- ─────────────────────────────────────────────

-- Drop if exists to make idempotent
DROP TRIGGER IF EXISTS cashbox_reservation_overreserve_guard_trigger
  ON public.cashbox_reservations;

CREATE TRIGGER cashbox_reservation_overreserve_guard_trigger
  BEFORE INSERT OR UPDATE ON public.cashbox_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.cashbox_reservation_overreserve_guard();

-- ─────────────────────────────────────────────
-- 3. Verification
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'cashbox_reservations'
    AND t.tgname = 'cashbox_reservation_overreserve_guard_trigger';

  IF v_count = 1 THEN
    RAISE NOTICE 'SUCCESS: cashbox_reservation_overreserve_guard_trigger is active';
  ELSE
    RAISE WARNING 'FAIL: trigger not found, count=%', v_count;
  END IF;
END $$;
