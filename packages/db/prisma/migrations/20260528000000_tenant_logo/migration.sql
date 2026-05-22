-- Tenant logo URL for branded receipts (PAGES §48). Mirrors
-- products.image_url (slice 1.8e). No backfill; defaults to NULL.

ALTER TABLE "tenants"
  ADD COLUMN "logo_url" TEXT;
