-- Offline sync validation (ADR 0005, audit M-14 remainder).
--
-- * sales.device_id: stable per-installation id the POS persists locally and
--   sends with every sale — gives sequence validation a subject.
-- * SyncConflictKind gains 'sequence_gap' for missing/out-of-order
--   client_sequence values per device.
-- (price_drift conflicts use the existing enum value; they were previously
-- unreachable.)

-- Adding an enum value is allowed inside Prisma's migration transaction as
-- long as the value isn't USED in the same transaction (PG12+).
ALTER TYPE "SyncConflictKind" ADD VALUE IF NOT EXISTS 'sequence_gap';

ALTER TABLE "sales" ADD COLUMN "device_id" UUID;

CREATE INDEX "sales_tenant_id_device_id_client_sequence_idx"
  ON "sales"("tenant_id", "device_id", "client_sequence" DESC);
