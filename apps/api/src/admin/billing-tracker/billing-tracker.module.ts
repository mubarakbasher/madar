import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { EmailModule } from "../../common/email/email.module";
import { BillingTrackerController } from "./billing-tracker.controller";
import { BillingTrackerService } from "./billing-tracker.service";

@Module({
  imports: [AdminAuthModule, EmailModule],
  controllers: [BillingTrackerController],
  providers: [BillingTrackerService],
  exports: [BillingTrackerService],
})
export class BillingTrackerModule {}
