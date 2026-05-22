-- Add product image_url column.
--
-- Stores the relative path within the storage backend
-- (e.g. "tenants/{tenant_id}/products/{product_id}.webp"). NULL when no image
-- has been uploaded; the frontend falls back to the deterministic gradient
-- swatch derived from product.id.
--
-- No RLS change needed — column inherits the existing tenant_isolation policy
-- on `products`.

ALTER TABLE "products" ADD COLUMN "image_url" TEXT;
