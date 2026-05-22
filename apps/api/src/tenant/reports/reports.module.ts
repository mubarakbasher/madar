import { Module } from "@nestjs/common";
import { MoversModule } from "./movers/movers.module";
import { PnlModule } from "./pnl/pnl.module";
import { ScheduledReportsModule } from "./scheduled/module";
import { TaxReportModule } from "./tax/tax.module";
import { TrendsModule } from "./trends/trends.module";

/**
 * Phase 3 reporting umbrella. Each slice ships its own inner module under
 * `apps/api/src/tenant/reports/<slice>/` and registers here. Tenant module
 * imports ReportsModule once; ReportsModule re-exports the inner modules so
 * controllers + providers are wired uniformly.
 */
@Module({
  imports: [
    // Slices register here.
    MoversModule,
    PnlModule,
    ScheduledReportsModule.forRoot(),
    TaxReportModule,
    TrendsModule,
  ],
})
export class ReportsModule {}
