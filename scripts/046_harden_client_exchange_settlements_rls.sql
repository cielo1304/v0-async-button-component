-- 046: Harden RLS on client_exchange_settlements
-- Prevents inserting settlements for operations the user doesn't own (UUID guessing attack).
-- Safe to run multiple times (DROP IF EXISTS + CREATE).

-- Drop old permissive insert policy
DROP POLICY IF EXISTS "client_exchange_settlements_insert" ON public.client_exchange_settlements;

-- Recreate with stricter WITH CHECK: operation must actually exist
CREATE POLICY "client_exchange_settlements_insert"
  ON public.client_exchange_settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND operation_id IN (SELECT id FROM public.client_exchange_operations)
  );
