/**
 * Registers BullMQ repeat jobs on application bootstrap.
 *
 * Two daily cron jobs are scheduled at 08:00 UTC by default (override via
 * env `ADMIN_CRON_PATTERN`). When the queue is unavailable (no Redis), we
 * log a warning and skip — the inline manual-trigger paths still work.
 *
 * Idempotent: re-registering the same job id is a no-op for BullMQ, so app
 * restarts don't accumulate duplicate schedules.
 */
import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { loadEnv } from "../../env";
import {
  ADMIN_CRON_QUEUE,
  BILLING_TICK_JOB,
  LOW_STOCK_JOB,
  TRIAL_REMINDER_JOB,
  type CronJobPayload,
} from "./cron.types";

const DEFAULT_CRON_PATTERN = "0 8 * * *"; // 08:00 UTC daily.

@Injectable()
export class BootstrapCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapCronService.name);

  constructor(
    @Optional()
    @InjectQueue(ADMIN_CRON_QUEUE)
    private readonly queue: Queue<CronJobPayload> | undefined,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        "admin-cron queue unavailable (no REDIS_URL); manual triggers still work, but the daily schedule will NOT fire automatically.",
      );
      return;
    }
    const pattern = loadEnv().ADMIN_CRON_PATTERN || DEFAULT_CRON_PATTERN;
    try {
      await this.registerRepeat(TRIAL_REMINDER_JOB, pattern, "trial-reminder-daily");
      await this.registerRepeat(LOW_STOCK_JOB, pattern, "low-stock-daily");
      await this.registerRepeat(BILLING_TICK_JOB, pattern, "billing-tick-daily");
      this.logger.log(`admin-cron repeats registered with pattern "${pattern}"`);
    } catch (err) {
      this.logger.error("admin-cron repeat registration failed", err);
    }
  }

  private static _keepInject = Inject;

  private async registerRepeat(
    jobName: string,
    pattern: string,
    repeatJobId: string,
  ): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      jobName,
      { triggeredBy: "cron" } satisfies CronJobPayload,
      {
        repeat: { pattern, tz: "UTC" },
        jobId: repeatJobId,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    );
  }
}
