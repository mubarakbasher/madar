/**
 * NestJS module that wires the send-PO-email queue + worker.
 *
 * Imported (eventually) by the PurchaseOrders module so its service can
 * inject `SendPoEmailQueue` and call `.enqueue(payload)` after a PO is
 * marked sent.
 *
 * Redis-availability is decided at bootstrap by REDIS_URL: when set, we use
 * BullModule for a real queue + worker; when unset (tests, dev with no
 * Redis), we register only the queue helper and skip the BullMQ wiring —
 * the helper's inline fallback then handles execution.
 *
 * This mirrors the pattern used by `RedisService`: degrade gracefully rather
 * than failing module bootstrap when infrastructure is missing.
 */
import { Module, type DynamicModule } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { loadEnv } from "../../../env";
import { SendPoEmailProcessor } from "./send-po-email.processor";
import { SendPoEmailQueue } from "./send-po-email.queue";
import { SEND_PO_EMAIL_QUEUE } from "./send-po-email.types";

@Module({})
export class SendPoEmailModule {
  static forRoot(): DynamicModule {
    const env = loadEnv();
    const redisUrl = env.REDIS_URL;

    if (!redisUrl) {
      // No Redis: register only the queue helper. The processor + BullModule
      // are intentionally omitted — `SendPoEmailQueue` will detect the missing
      // injection and run jobs inline.
      return {
        module: SendPoEmailModule,
        providers: [SendPoEmailQueue],
        exports: [SendPoEmailQueue],
      };
    }

    const parsed = new URL(redisUrl);
    return {
      module: SendPoEmailModule,
      imports: [
        BullModule.forRoot({
          connection: {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : 6379,
            password: parsed.password || undefined,
            username: parsed.username || undefined,
          },
        }),
        BullModule.registerQueue({ name: SEND_PO_EMAIL_QUEUE }),
      ],
      providers: [SendPoEmailProcessor, SendPoEmailQueue],
      exports: [SendPoEmailQueue, BullModule],
    };
  }
}
