-- =============================================
-- Migration: 031_exchange_rls_tenant_isolation.sql
-- Description: Replace allow-all policies with proper tenant isolation for exchange_deals and exchange_legs
-- =============================================

-- Drop existing allow-all policies
DROP POLICY IF EXISTS "Allow all operations on exchange_deals for authenticated users" ON exchange_deals;
DROP POLICY IF EXISTS "Allow all operations on exchange_legs for authenticated users" ON exchange_legs;

-- =============================================
-- exchange_deals tenant isolation policies
-- =============================================

CREATE POLICY "exchange_deals_select_by_company"
ON exchange_deals FOR SELECT
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_deals_insert_by_company"
ON exchange_deals FOR INSERT
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_deals_update_by_company"
ON exchange_deals FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_deals_delete_by_company"
ON exchange_deals FOR DELETE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- =============================================
-- exchange_legs tenant isolation policies
-- =============================================

CREATE POLICY "exchange_legs_select_by_company"
ON exchange_legs FOR SELECT
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_legs_insert_by_company"
ON exchange_legs FOR INSERT
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_legs_update_by_company"
ON exchange_legs FOR UPDATE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

CREATE POLICY "exchange_legs_delete_by_company"
ON exchange_legs FOR DELETE
USING (
  company_id IN (SELECT company_id FROM team_members WHERE user_id = auth.uid())
);

-- =============================================
-- Comments
-- =============================================

COMMENT ON POLICY "exchange_deals_select_by_company" ON exchange_deals IS 
'Users can only select exchange deals for companies they belong to';

COMMENT ON POLICY "exchange_deals_insert_by_company" ON exchange_deals IS 
'Users can only insert exchange deals for companies they belong to';

COMMENT ON POLICY "exchange_deals_update_by_company" ON exchange_deals IS 
'Users can only update exchange deals for companies they belong to';

COMMENT ON POLICY "exchange_deals_delete_by_company" ON exchange_deals IS 
'Users can only delete exchange deals for companies they belong to';

COMMENT ON POLICY "exchange_legs_select_by_company" ON exchange_legs IS 
'Users can only select exchange legs for companies they belong to';

COMMENT ON POLICY "exchange_legs_insert_by_company" ON exchange_legs IS 
'Users can only insert exchange legs for companies they belong to';

COMMENT ON POLICY "exchange_legs_update_by_company" ON exchange_legs IS 
'Users can only update exchange legs for companies they belong to';

COMMENT ON POLICY "exchange_legs_delete_by_company" ON exchange_legs IS 
'Users can only delete exchange legs for companies they belong to';
