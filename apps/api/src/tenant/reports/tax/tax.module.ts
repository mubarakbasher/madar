import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { TaxReportController } from "./tax.controller";
import { TaxReportService } from "./tax.service";

/**
 * Tax-report slice of Phase 3 Reporting.
 * Registered in apps/api/src/tenant/reports/reports.module.ts.
 */
@Module({
  imports: [AuthModule],
  controllers: [TaxReportController],
  providers: [TaxReportService],
  exports: [TaxReportService],
})
export class TaxReportModule {}
