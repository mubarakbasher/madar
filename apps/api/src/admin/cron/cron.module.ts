/**
 * Admin cron module. Daily-scheduled jobs for trial reminders + low-stock
 * alerts.
 *
 * Redis-aware bootstrap: when REDIS_URL is set we wire a real BullMQ queue +
 * worker + repeat-registration service; when unset, we register only the
 * service and controller — the manual `/run-now` endpoints still work, but
 * the cron schedule does not fire. Mirrors the SendPoEmailModule pattern.
 */
import { Module, type DynamicModule } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { loadEnv } from "../../env";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { BillingTrackerModule } from "../billing-tracker/billing-tracker.module";
import { AdminCronController } from "./cron.controller";
import { AdminCronProcessor } from "./cron.processor";
import { AdminCronService } from "./cron.service";
import { BootstrapCronService } from "./bootstrap-cron.service";
import { ADMIN_CRON_QUEUE } from "./cron.types";

@Module({})
export class AdminCronModule {
  static forRoot(): DynamicModule {
    const env = loadEnv();
    const redisUrl = env.REDIS_URL;

    if (!redisUrl) {
      return {
        module: AdminCronModule,
        imports: [AdminAuthModule, BillingTrackerModule],
        providers: [AdminCronService],
        controllers: [AdminCronController],
        exports: [AdminCronService],
      };
    }

    const parsed = new URL(redisUrl);
    return {
      module: AdminCronModule,
      imports: [
        AdminAuthModule,
        BillingTrackerModule,
        BullModule.forRoot({
          connection: {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : 6379,
            password: parsed.password || undefined,
            username: parsed.username || undefined,
          },
        }),
        BullModule.registerQueue({ name: ADMIN_CRON_QUEUE }),
      ],
      providers: [AdminCronService, AdminCronProcessor, BootstrapCronService],
      controllers: [AdminCronController],
      exports: [AdminCronService, BullModule],
    };
  }
}
