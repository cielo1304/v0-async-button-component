-- =============================================================
-- Migration 058 (part 1): Assets module — add company_id columns
--
-- ADD-ONLY. Adds company_id to child tables of Assets and
-- backfills from the parent `assets` row.
-- =============================================================

ALTER TABLE asset_valuations        ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE asset_location_moves    ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE asset_sale_events       ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE finance_collateral_links  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE finance_collateral_chain  ADD COLUMN IF NOT EXISTS company_id UUID;

CREATE INDEX IF NOT EXISTS idx_asset_valuations_company          ON asset_valuations(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_location_moves_company      ON asset_location_moves(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_sale_events_company         ON asset_sale_events(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_collateral_links_company  ON finance_collateral_links(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_collateral_chain_company  ON finance_collateral_chain(company_id);

UPDATE asset_valuations av
SET    company_id = a.company_id
FROM   assets a
WHERE  av.asset_id = a.id
  AND  av.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE asset_location_moves alm
SET    company_id = a.company_id
FROM   assets a
WHERE  alm.asset_id = a.id
  AND  alm.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE asset_sale_events ase
SET    company_id = a.company_id
FROM   assets a
WHERE  ase.asset_id = a.id
  AND  ase.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE finance_collateral_links fcl
SET    company_id = a.company_id
FROM   assets a
WHERE  fcl.asset_id = a.id
  AND  fcl.company_id IS NULL
  AND  a.company_id IS NOT NULL;

UPDATE finance_collateral_chain fcc
SET    company_id = a.company_id
FROM   assets a
WHERE  fcc.old_asset_id = a.id
  AND  fcc.company_id IS NULL
  AND  a.company_id IS NOT NULL;
