-- Phase 3 — Scheduled report email delivery.
--
-- One tenant-scoped table (scheduled_reports) backing a BullMQ repeat-job
-- driver. The cron_pattern is denormalized from cadence at write-time so
-- owners can later override (e.g. "every Monday 9am" → "0 9 * * 1") without
-- code changes. recipients is a JSON array of email addresses; params is the
-- saved query string for the underlying report endpoint (e.g. P&L currency +
-- branch_id). last_run_at / last_status / last_error track the most recent
-- fire of this schedule for the UI's "last run" column.
--
-- RLS: canonical NULLIF tenant_isolation policy.

-- ── enums ───────────────────────────────────────────────────────────
CREATE TYPE "ScheduledReportKind"      AS ENUM ('pnl', 'tax', 'trends');
CREATE TYPE "ScheduledReportCadence"   AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE "ScheduledReportRunStatus" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "ScheduledReportFormat"    AS ENUM ('csv', 'pdf');

-- ── scheduled_reports ──────────────────────────────────────────────
CREATE TABLE "scheduled_reports" (
    "id"            UUID                       NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID                       NOT NULL,
    "name"          TEXT                       NOT NULL,
    "report_kind"   "ScheduledReportKind"      NOT NULL,
    "cadence"       "ScheduledReportCadence"   NOT NULL,
    "cron_pattern"  TEXT                       NOT NULL,
    "params"        JSONB                      NOT NULL DEFAULT '{}'::jsonb,
    "recipients"    JSONB                      NOT NULL,
    "format"        "ScheduledReportFormat"    NOT NULL,
    "timezone"      TEXT                       NOT NULL DEFAULT 'Africa/Cairo',
    "last_run_at"   TIMESTAMPTZ,
    "last_status"   "ScheduledReportRunStatus",
    "last_error"    TEXT,
    "is_active"     BOOLEAN                    NOT NULL DEFAULT true,
    "created_at"    TIMESTAMPTZ                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"    UUID,
    "deleted_at"    TIMESTAMPTZ,
    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_reports_tenant_deleted_idx"
  ON "scheduled_reports" ("tenant_id", "deleted_at");
CREATE INDEX "scheduled_reports_tenant_active_idx"
  ON "scheduled_reports" ("tenant_id", "is_active");
CREATE INDEX "scheduled_reports_tenant_kind_idx"
  ON "scheduled_reports" ("tenant_id", "report_kind");

-- ── updated_at trigger ─────────────────────────────────────────────
CREATE TRIGGER scheduled_reports_set_updated_at BEFORE UPDATE ON "scheduled_reports"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE "scheduled_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scheduled_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "scheduled_reports"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  );
