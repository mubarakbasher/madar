-- Tenant Business Settings (PAGES.md §46) — adds the four columns the
-- /settings/business page surfaces to the owner. No backfill needed: timezone
-- + fiscal_year_start_month carry sensible defaults; legal_name and
-- business_type are nullable.

CREATE TYPE "BusinessType" AS ENUM (
  'retail',
  'wholesale',
  'restaurant',
  'pharmacy',
  'services',
  'other'
);

ALTER TABLE "tenants"
  ADD COLUMN "legal_name"              TEXT,
  ADD COLUMN "business_type"           "BusinessType",
  ADD COLUMN "timezone"                TEXT NOT NULL DEFAULT 'Africa/Cairo',
  ADD COLUMN "fiscal_year_start_month" SMALLINT NOT NULL DEFAULT 1
    CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12);
