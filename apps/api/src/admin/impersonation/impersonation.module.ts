import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { AuthModule } from "../../tenant/auth/auth.module";
import { AdminImpersonationController } from "./impersonation.controller";
import { ImpersonationService } from "./impersonation.service";

@Module({
  imports: [AdminAuthModule, AuthModule],
  controllers: [AdminImpersonationController],
  providers: [ImpersonationService],
  exports: [ImpersonationService],
})
export class AdminImpersonationModule {}
