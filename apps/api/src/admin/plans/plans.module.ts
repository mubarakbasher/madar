import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
