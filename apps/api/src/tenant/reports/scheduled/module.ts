/**
 * Scheduled-reports module.
 *
 * Wires the CRUD endpoints + BullMQ queue/worker for the email-delivery job.
 * Mirrors the redis-availability pattern from `SendPoEmailModule`: when
 * REDIS_URL is set we register the real BullMQ wiring; otherwise we register
 * only the queue helper (which falls back to inline execution for `Run now`
 * and disables cron repeats with a logged warning).
 *
 * Slice services (P&L, Tax, Trends) are imported via their modules so this
 * slice can wire thin `ReportProducer` adapters that translate the saved
 * `params` JSON into each slice's query DTO. The adapters are bound to the
 * `PNL_REPORT_SERVICE` / `TAX_REPORT_SERVICE` / `TRENDS_REPORT_SERVICE`
 * tokens that `report-runner.ts` looks up at job-run time.
 */
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { loadEnv } from "../../../env";
import { AuthModule } from "../../auth/auth.module";
import { PnlModule } from "../pnl/pnl.module";
import { TaxReportModule } from "../tax/tax.module";
import { TrendsModule } from "../trends/trends.module";
import { ScheduledReportsController } from "./controller";
import { ScheduledReportsService } from "./service";
import { ScheduledReportQueue } from "./jobs/queue";
import { ScheduledReportProcessor } from "./jobs/processor";
import {
  PNL_REPORT_SERVICE,
  TAX_REPORT_SERVICE,
  TRENDS_REPORT_SERVICE,
} from "./jobs/report-runner";
import {
  PnlProducer,
  TaxProducer,
  TrendsProducer,
} from "./jobs/report-adapters";
import { SCHEDULED_REPORT_QUEUE } from "./jobs/types";

const PRODUCER_PROVIDERS: Provider[] = [
  PnlProducer,
  TaxProducer,
  TrendsProducer,
  { provide: PNL_REPORT_SERVICE, useExisting: PnlProducer },
  { provide: TAX_REPORT_SERVICE, useExisting: TaxProducer },
  { provide: TRENDS_REPORT_SERVICE, useExisting: TrendsProducer },
];

@Module({})
export class ScheduledReportsModule {
  static forRoot(): DynamicModule {
    const env = loadEnv();
    const redisUrl = env.REDIS_URL;

    const baseImports = [AuthModule, PnlModule, TaxReportModule, TrendsModule];

    if (!redisUrl) {
      return {
        module: ScheduledReportsModule,
        imports: baseImports,
        controllers: [ScheduledReportsController],
        providers: [
          ScheduledReportsService,
          ScheduledReportQueue,
          ...PRODUCER_PROVIDERS,
        ],
        exports: [ScheduledReportsService],
      };
    }

    const parsed = new URL(redisUrl);
    return {
      module: ScheduledReportsModule,
      imports: [
        ...baseImports,
        BullModule.forRoot({
          connection: {
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : 6379,
            password: parsed.password || undefined,
            username: parsed.username || undefined,
          },
        }),
        BullModule.registerQueue({ name: SCHEDULED_REPORT_QUEUE }),
      ],
      controllers: [ScheduledReportsController],
      providers: [
        ScheduledReportsService,
        ScheduledReportQueue,
        ScheduledReportProcessor,
        ...PRODUCER_PROVIDERS,
      ],
      exports: [ScheduledReportsService, BullModule],
    };
  }
}
