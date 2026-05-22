import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminImpersonationModule } from "../../admin/impersonation/impersonation.module";
import { TenantImpersonationController } from "./impersonation.controller";

@Module({
  imports: [AuthModule, AdminImpersonationModule],
  controllers: [TenantImpersonationController],
})
export class TenantImpersonationModule {}
