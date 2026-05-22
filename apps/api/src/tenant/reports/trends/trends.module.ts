import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { TrendsController } from "./trends.controller";
import { TrendsService } from "./trends.service";

/**
 * Reports slice 3: trend analysis. Registered by the umbrella
 * ReportsModule in `apps/api/src/tenant/reports/reports.module.ts`.
 */
@Module({
  imports: [AuthModule],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}
