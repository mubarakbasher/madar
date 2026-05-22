-- Phase 2.3 — Offline POS.
--
-- Two changes:
--   * sales gains three columns the offline sync engine relies on:
--       - client_occurred_at: when the sale rang at the offline POS (server
--         clamps to now() if absent or in the future).
--       - has_negative_stock: server raises this when branch_stock drops
--         below zero on commit (manager review required).
--       - offline_completed: client sets true when the sale was rang offline
--         and synced later. Drives the receipt UI's "offline" badge.
--   * sync_conflicts (new tenant-scoped table) — surface points for offline
--     conflicts. The MVP only emits 'negative_stock'; the other kinds are
--     placeholders for future detectors.
--
-- RLS: canonical NULLIF tenant_isolation policy (see 20260514020000).
-- sync_conflicts has no updated_at — the resolve flow stamps reviewed_at +
-- review_notes once and the row is immutable thereafter (append-only history
-- in spirit; resolve is a one-shot terminal mutation).

-- ── enums ───────────────────────────────────────────────────────────
CREATE TYPE "SyncConflictKind" AS ENUM (
  'negative_stock',
  'duplicate_uuid',
  'product_unknown',
  'price_drift'
);

CREATE TYPE "SyncConflictStatus" AS ENUM (
  'open',
  'acknowledged',
  'resolved',
  'ignored'
);

-- ── sales extensions ────────────────────────────────────────────────
ALTER TABLE "sales"
  ADD COLUMN "client_occurred_at" TIMESTAMPTZ,
  ADD COLUMN "has_negative_stock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offline_completed"  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "sales_tenant_has_negative_stock_idx"
  ON "sales" ("tenant_id", "has_negative_stock")
  WHERE "has_negative_stock" = true;

-- ── sync_conflicts ─────────────────────────────────────────────────
CREATE TABLE "sync_conflicts" (
    "id"                UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID                  NOT NULL,
    "conflict_kind"     "SyncConflictKind"    NOT NULL,
    "reference_table"   TEXT                  NOT NULL,
    "reference_id"      UUID                  NOT NULL,
    "details"           JSONB                 NOT NULL,
    "resolution_status" "SyncConflictStatus"  NOT NULL DEFAULT 'open',
    "reviewed_by"       UUID,
    "reviewed_at"       TIMESTAMPTZ,
    "review_notes"      TEXT,
    "occurred_at"       TIMESTAMPTZ           NOT NULL,
    "created_at"        TIMESTAMPTZ           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_conflicts_tenant_status_created_idx"
  ON "sync_conflicts" ("tenant_id", "resolution_status", "created_at" DESC);
CREATE INDEX "sync_conflicts_tenant_reference_idx"
  ON "sync_conflicts" ("tenant_id", "reference_table", "reference_id");

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE "sync_conflicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_conflicts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sync_conflicts"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );
