/**
 * Queue helper for scheduled-reports — producer side.
 *
 * Two distinct call paths feed this queue:
 *
 *   1. `enqueueRunNow()` — one-off fire from the `Run now` button or as the
 *      inline tick of a brand-new schedule. When Redis is up, BullMQ delivers
 *      to the worker; when Redis is down, we fall back to inline execution so
 *      tests + dev-without-Redis still work.
 *
 *   2. `registerRepeat()` / `unregisterRepeat()` — register a BullMQ repeat
 *      job per active schedule. Cron repeats REQUIRE Redis; when Redis is
 *      missing, we log a one-time warning and proceed without cron — the
 *      manual `Run now` button still works. This is the deliberate trade-off
 *      that keeps the dev experience friction-free for everything but cron.
 *
 * Pattern mirrors `apps/api/src/tenant/purchase-orders/jobs/send-po-email.queue.ts`.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { EmailService } from "../../../../common/email/email.service";
import { AuditService } from "../../../auth/audit.service";
import { runScheduledReportJob } from "./processor";
import {
  CADENCE_CRON,
  SCHEDULED_REPORT_QUEUE,
  SCHEDULED_REPORT_RUN_ONCE,
  type ScheduledReportJobPayload,
} from "./types";

@Injectable()
export class ScheduledReportQueue {
  private readonly logger = new Logger(ScheduledReportQueue.name);

  constructor(
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    @InjectQueue(SCHEDULED_REPORT_QUEUE)
    private readonly queue: Queue<ScheduledReportJobPayload> | undefined,
  ) {}

  /**
   * Whether a real BullMQ queue is wired. Used by the service to decide
   * whether to bother registering cron repeats; when false, cron is a no-op
   * with a logged warning.
   */
  get hasQueue(): boolean {
    return !!this.queue;
  }

  /**
   * Fire a schedule one-off. Used by `Run now` and as the "tick the moment
   * the schedule is created" path. Inline-fallback when no queue exists.
   */
  async enqueueRunNow(payload: ScheduledReportJobPayload): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(SCHEDULED_REPORT_RUN_ONCE, payload, {
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        });
        return;
      } catch (err) {
        this.logger.warn(
          `BullMQ unavailable for scheduled-report run-now, running inline: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.debug("No BullMQ queue wired for scheduled-reports; running inline.");
    }
    await runScheduledReportJob(this.email, this.audit, this.moduleRef, payload);
  }

  /**
   * (Re)register the repeatable BullMQ job for the given schedule. Idempotent:
   * we remove the previous repeat entry under the same jobId first.
   *
   * Without Redis, this is a no-op + warning. The schedule still saves and
   * can be fired manually; only the wall-clock fires are skipped.
   */
  async registerRepeat(opts: {
    scheduleId: string;
    tenantId: string;
    cronPattern: string;
    timezone: string;
  }): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `BullMQ unavailable — schedule ${opts.scheduleId} created/updated but cron repeats are disabled. Run-now still works.`,
      );
      return;
    }
    const jobId = repeatJobId(opts.scheduleId);
    try {
      // Best-effort cleanup of any prior repeat under the same name (e.g.
      // cadence changed → cron pattern changed → old key still scheduled).
      await this.queue.removeRepeatableByKey(jobId).catch(() => {});
      await this.queue.add(
        SCHEDULED_REPORT_RUN_ONCE,
        {
          scheduleId: opts.scheduleId,
          tenantId: opts.tenantId,
          manual: false,
        } satisfies ScheduledReportJobPayload,
        {
          repeat: {
            pattern: opts.cronPattern,
            tz: opts.timezone,
          },
          jobId,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (err) {
      this.logger.warn(
        `failed to register repeat for schedule ${opts.scheduleId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Remove the repeatable job for `scheduleId`. Used on delete + on
   * `is_active=false` transitions. Safe to call when the job doesn't exist.
   */
  async unregisterRepeat(scheduleId: string): Promise<void> {
    if (!this.queue) return;
    const jobId = repeatJobId(scheduleId);
    try {
      // BullMQ's repeatable jobs are keyed by name+pattern+tz; we don't know
      // the exact key without listing, so we use `removeRepeatableByKey` and
      // also iterate `getRepeatableJobs` to be thorough.
      await this.queue.removeRepeatableByKey(jobId).catch(() => {});
      const repeatables = await this.queue.getRepeatableJobs(0, 200).catch(() => []);
      for (const r of repeatables) {
        if (r.id === jobId) {
          await this.queue.removeRepeatableByKey(r.key).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn(
        `failed to unregister repeat for schedule ${scheduleId}: ${(err as Error).message}`,
      );
    }
  }
}

/** Used as BullMQ's `jobId` for the repeat entry. */
export function repeatJobId(scheduleId: string): string {
  return `repeat-${scheduleId}`;
}

export { CADENCE_CRON, SCHEDULED_REPORT_QUEUE, SCHEDULED_REPORT_RUN_ONCE };

// Suppress unused-import warning for Inject in some lint configs.
void Inject;
