-- Diagnostic: list which Assets-related tables actually exist
-- and what columns they have. No mutations.

SELECT
  t.table_name,
  (SELECT string_agg(c.column_name, ', ' ORDER BY c.ordinal_position)
     FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = t.table_name) AS columns
FROM (
  SELECT unnest(ARRAY[
    'assets',
    'asset_locations',
    'asset_valuations',
    'asset_location_moves',
    'asset_sale_events',
    'finance_collateral_links',
    'finance_collateral_chain'
  ]) AS table_name
) t
WHERE EXISTS (
  SELECT 1
    FROM information_schema.tables it
   WHERE it.table_schema = 'public'
     AND it.table_name   = t.table_name
);
