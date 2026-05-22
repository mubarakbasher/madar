-- Per-tenant notification on/off matrix (Slice 6 / PAGES §52). Hook into the
-- existing cron + email senders so any tenant can mute a specific event
-- without touching env vars.

CREATE TYPE "NotificationEventType" AS ENUM (
  'low_stock',
  'trial_ending',
  'invoice_issued',
  'invoice_overdue',
  'payment_received',
  'payment_verified',
  'refund_completed',
  'shift_variance',
  'sync_failure'
);

CREATE TYPE "NotificationChannel" AS ENUM ('email', 'in_app');

CREATE TABLE "notification_preferences" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL,
  "event_type"  "NotificationEventType" NOT NULL,
  "channel"     "NotificationChannel"   NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "event_type", "channel")
);

CREATE INDEX "notification_preferences_tenant_id_idx"
  ON "notification_preferences"("tenant_id");

CREATE TRIGGER "notification_preferences_set_updated_at"
  BEFORE UPDATE ON "notification_preferences"
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- RLS via the canonical tenant_isolation policy + NULLIF cast (matches every
-- other tenant-scoped table).
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notification_preferences"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_super_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_preferences" TO madar_app;
