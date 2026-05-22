import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { BillingTrackerController } from "./billing-tracker.controller";
import { BillingTrackerService } from "./billing-tracker.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [BillingTrackerController],
  providers: [BillingTrackerService],
  exports: [BillingTrackerService],
})
export class BillingTrackerModule {}
