/**
 * Queue helper for the send-PO-email job.
 *
 * Producer side of the job: provides `enqueueSendPoEmailJob` which the PO
 * service will call after an outbound PO is finalized.
 *
 * Inline fallback — the precedent the rest of the codebase follows is the
 * `RedisService` graceful-degrade pattern (see `apps/api/src/common/redis.service.ts`):
 * when Redis is unavailable, the system continues to work, just slower /
 * less concurrent. We mirror that here: if `queue.add()` throws (Redis down,
 * connection refused, etc.), the job runs in-process synchronously. Vitest
 * runs without REDIS_URL, so the fallback IS the test-time code path.
 *
 * Cost: an inline run blocks the request for as long as the PDF render +
 * email send takes (a few hundred ms in practice). Acceptable for a "Send
 * to supplier" button. The alternative — failing the request — would be
 * worse UX for what is fundamentally a notification side-effect.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { EmailService } from "../../../common/email/email.service";
import { runSendPoEmailJob } from "./send-po-email.processor";
import {
  SEND_PO_EMAIL_JOB,
  SEND_PO_EMAIL_QUEUE,
  type SendPoEmailJobPayload,
} from "./send-po-email.types";

@Injectable()
export class SendPoEmailQueue {
  private readonly logger = new Logger(SendPoEmailQueue.name);

  constructor(
    private readonly email: EmailService,
    /**
     * The queue is `@Optional` so tests that boot the module without a
     * Redis-backed BullMQ (the default) still wire cleanly. In that case
     * `enqueue()` skips the `queue.add` attempt entirely and goes straight
     * to inline execution.
     */
    @Optional()
    @InjectQueue(SEND_PO_EMAIL_QUEUE)
    private readonly queue: Queue<SendPoEmailJobPayload> | undefined,
  ) {}

  async enqueue(payload: SendPoEmailJobPayload): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add(SEND_PO_EMAIL_JOB, payload, {
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        });
        return;
      } catch (err) {
        this.logger.warn(
          `BullMQ unavailable for send-po-email, running inline: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.debug("No BullMQ queue wired for send-po-email; running inline.");
    }
    // Inline fallback. We intentionally `await` so the caller's promise chain
    // reflects success/failure of the actual send. Errors propagate.
    await runSendPoEmailJob(this.email, payload);
  }
}

/**
 * Functional convenience wrapper for non-Nest call sites (tests, scripts).
 * The Nest module provides the `SendPoEmailQueue` injectable above; this is
 * the same thing without DI.
 */
export async function enqueueSendPoEmailJob(
  ctx: { email: EmailService; queue?: Queue<SendPoEmailJobPayload> | null; logger?: Logger },
  payload: SendPoEmailJobPayload,
): Promise<void> {
  const logger = ctx.logger ?? new Logger("enqueueSendPoEmailJob");
  if (ctx.queue) {
    try {
      await ctx.queue.add(SEND_PO_EMAIL_JOB, payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      });
      return;
    } catch (err) {
      logger.warn(
        `BullMQ unavailable for send-po-email, running inline: ${(err as Error).message}`,
      );
    }
  }
  await runSendPoEmailJob(ctx.email, payload);
}

// Re-export to keep the producer-side import surface flat.
export { SEND_PO_EMAIL_JOB, SEND_PO_EMAIL_QUEUE, type SendPoEmailJobPayload };

// Suppress unused-import warning for Inject (kept for symmetry with future
// extension points; some lint configs flag any unused import).
void Inject;
