-- Cron-job dedup columns for the daily admin/cron module.
--
--   tenants.trial_reminder_sent_at — flipped once when the trial-ending
--     reminder fires, so a second tick the same day (or after) is a no-op.
--
--   branch_stock.last_low_stock_alert_at — bumped on each row included in a
--     low-stock digest. Re-firing within 24h skips alerted rows; after 24h
--     they re-qualify if they're still at-or-below their reorder point.
--
-- Both columns are nullable and additive — no backfill required.
-- Neither column changes RLS behaviour: tenants is platform-scoped, and
-- branch_stock already carries the canonical tenant_isolation policy.

ALTER TABLE "tenants"
  ADD COLUMN "trial_reminder_sent_at" TIMESTAMPTZ;

ALTER TABLE "branch_stock"
  ADD COLUMN "last_low_stock_alert_at" TIMESTAMPTZ;
