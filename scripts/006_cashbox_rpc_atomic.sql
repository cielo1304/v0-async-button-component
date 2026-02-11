-- Migration 006: Atomic cashbox_operation RPC + CLIENT_EXCHANGE category
-- Already applied via supabase_apply_migration

-- 1. Extend transactions category CHECK
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check
  CHECK (category = ANY (ARRAY[
    'DEPOSIT','WITHDRAW','DEAL_PAYMENT','EXPENSE','SALARY',
    'EXCHANGE_OUT','EXCHANGE_IN','TRANSFER_OUT','TRANSFER_IN',
    'CLIENT_EXCHANGE_IN','CLIENT_EXCHANGE_OUT'
  ]));

-- 2. Atomic RPC: update balance + insert transaction in one call
CREATE OR REPLACE FUNCTION cashbox_operation(
  p_cashbox_id UUID,
  p_amount NUMERIC,
  p_category TEXT,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
)
RETURNS TABLE(new_balance NUMERIC, transaction_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance NUMERIC;
  v_tx_id UUID;
BEGIN
  UPDATE cashboxes
    SET balance = balance + p_amount,
        updated_at = now()
    WHERE id = p_cashbox_id
    RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashbox % not found', p_cashbox_id;
  END IF;

  INSERT INTO transactions(
    cashbox_id, amount, balance_after, category, description,
    reference_id, deal_id, created_by
  )
  VALUES (
    p_cashbox_id, p_amount, v_new_balance, p_category,
    COALESCE(p_description, p_category),
    p_reference_id, p_deal_id, p_created_by
  )
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;
