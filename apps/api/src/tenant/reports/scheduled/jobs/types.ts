/**
 * Shared constants + payload shape for the scheduled-reports job.
 *
 * Two job names share one queue:
 *   - SCHEDULED_REPORT_RUN_ONCE — fires from `Run now` + the BullMQ cron repeats.
 *     Both carry the same payload; the cron pattern just drives WHEN it fires.
 *
 * Keeping this file Prisma-free + Nest-free so the producer (controller/service)
 * and any future cross-package consumers can import the types without
 * dragging in the worker code path.
 */

export const SCHEDULED_REPORT_QUEUE = "scheduled-reports";
export const SCHEDULED_REPORT_RUN_ONCE = "scheduled-report-run-once";

export interface ScheduledReportJobPayload {
  /** Tenant the schedule belongs to. The processor double-checks. */
  tenantId: string;
  /** Schedule row id; used to load name, recipients, params, etc. */
  scheduleId: string;
  /** Triggered manually via `Run now`, vs. cron. Used only for the audit row. */
  triggeredByUserId?: string;
  /** Whether this came from the manual "Run now" button. */
  manual?: boolean;
}

/** Cadence → cron-pattern table. Times are LOCAL to the schedule's timezone;
 *  BullMQ's `tz` option resolves the actual UTC fire moment. */
export const CADENCE_CRON: Record<"daily" | "weekly" | "monthly", string> = {
  daily: "0 9 * * *", // 09:00 every day
  weekly: "0 9 * * 1", // 09:00 every Monday
  monthly: "0 9 1 * *", // 09:00 on the 1st of the month
};
