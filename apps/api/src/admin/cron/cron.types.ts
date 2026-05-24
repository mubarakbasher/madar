/**
 * Shared constants + payload shapes for the admin cron module.
 *
 * Two jobs share one BullMQ queue:
 *   trial-reminder-tick  — daily scan of `trialing` tenants whose
 *                          trial_ends_at lands within the reminder window
 *                          (2–3 days from now), sending the existing
 *                          `trial_ending` email exactly once per tenant.
 *   low-stock-tick       — daily scan of `branch_stock` rows where
 *                          qty_on_hand <= reorder_point with a 24h dedup,
 *                          mailing the owner a digest per tenant.
 *
 * Cron schedule is configurable via env. Default is 08:00 UTC daily.
 */

export const ADMIN_CRON_QUEUE = "admin-cron";

export const TRIAL_REMINDER_JOB = "trial-reminder-tick";
export const LOW_STOCK_JOB = "low-stock-tick";
export const BILLING_TICK_JOB = "billing-tick";

/** Reminder fires when trial_ends_at is between (now + WINDOW_MIN_DAYS) and
 *  (now + WINDOW_MAX_DAYS), and `trial_reminder_sent_at IS NULL`. The window
 *  is intentionally narrow so a manual run-now produces deterministic output. */
export const TRIAL_REMINDER_WINDOW_MIN_DAYS = 2;
export const TRIAL_REMINDER_WINDOW_MAX_DAYS = 3;

/** Low-stock digest dedup window: a branch_stock row that's already been
 *  alerted in the past 24h is skipped on the next tick. */
export const LOW_STOCK_DEDUP_HOURS = 24;

/** Cap on items per digest. Counts beyond this surface as an overflow note. */
export const LOW_STOCK_DIGEST_CAP = 50;

export interface CronJobPayload {
  /** Tag the run so manual triggers can be told apart from cron firings in
   *  the audit log. */
  triggeredBy: "cron" | "manual";
  /** Optional super-admin user id when the kind is 'manual'. */
  triggeredByUserId?: string;
}

export interface TrialReminderReport {
  ran_at: string;
  tenants_scanned: number;
  reminders_sent: number;
  skipped_no_recipient: number;
  errors: string[];
}

export interface LowStockReport {
  ran_at: string;
  tenants_scanned: number;
  tenants_alerted: number;
  items_alerted: number;
  errors: string[];
}
