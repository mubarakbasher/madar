-- 2.1d/2.1e/2.1f/2.1g — extend the branches table with operating hours,
-- holiday calendar, and geocoordinates for the map view.
--
-- operating_hours shape: { mon|tue|wed|thu|fri|sat|sun: { open: "HH:MM", close: "HH:MM", closed: boolean } }
-- holidays shape:        [{ date: "YYYY-MM-DD", label_i18n: { en, ar } }, ...]
-- geo_lat/geo_lng:       optional decimal coordinates (WGS84). DECIMAL(10,7) keeps
--                        ~1 cm precision and avoids floating-point drift on the boundary.

ALTER TABLE "branches"
  ADD COLUMN "operating_hours" JSONB,
  ADD COLUMN "holidays" JSONB,
  ADD COLUMN "geo_lat" DECIMAL(10, 7),
  ADD COLUMN "geo_lng" DECIMAL(10, 7);

-- Range guards so a typo can't put a branch on the wrong hemisphere.
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_geo_lat_range" CHECK ("geo_lat" IS NULL OR ("geo_lat" >= -90 AND "geo_lat" <= 90)),
  ADD CONSTRAINT "branches_geo_lng_range" CHECK ("geo_lng" IS NULL OR ("geo_lng" >= -180 AND "geo_lng" <= 180));

-- 2.1d — partial-unique: at most one default bank account per
-- (tenant_id, branch_id, currency_code). NULL branch_id means "tenant default".
-- We treat NULL as a real key value via COALESCE so the partial index applies
-- equally to chain-default and per-branch-default rows.
CREATE UNIQUE INDEX "tenant_bank_accounts_one_default_per_branch_currency"
  ON "tenant_bank_accounts" (
    "tenant_id",
    COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "currency_code"
  )
  WHERE "is_default" = TRUE AND "deleted_at" IS NULL;

CREATE INDEX "tenant_bank_accounts_tenant_id_branch_id_idx"
  ON "tenant_bank_accounts" ("tenant_id", "branch_id")
  WHERE "deleted_at" IS NULL;
