/**
 * BullMQ processor for the admin-cron queue. Dispatches by job name to the
 * service. Runs `runTrialReminderTick` and `runLowStockTick` as two distinct
 * job kinds on a single shared queue (mirrors the PO-email pattern).
 *
 * Inline fallback lives in cron.queue.ts — when REDIS_URL is unset, the
 * service is invoked directly without the BullMQ wrapper.
 */
import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { AdminCronService } from "./cron.service";
import { ADMIN_CRON_QUEUE, LOW_STOCK_JOB, TRIAL_REMINDER_JOB, type CronJobPayload } from "./cron.types";

@Processor(ADMIN_CRON_QUEUE)
export class AdminCronProcessor extends WorkerHost {
  private readonly logger = new Logger(AdminCronProcessor.name);

  constructor(private readonly cron: AdminCronService) {
    super();
  }

  async process(job: Job<CronJobPayload>): Promise<unknown> {
    switch (job.name) {
      case TRIAL_REMINDER_JOB:
        return this.cron.runTrialReminderTick(null);
      case LOW_STOCK_JOB:
        return this.cron.runLowStockTick(null);
      default:
        this.logger.warn(`Unknown admin-cron job: ${job.name}`);
        return { skipped: true, reason: "unknown_job_name" };
    }
  }
}
