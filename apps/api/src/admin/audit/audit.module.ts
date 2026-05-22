import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { AdminAuditController } from "./audit.controller";
import { AdminAuditQueryService } from "./audit.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminAuditController],
  providers: [AdminAuditQueryService],
})
export class AdminAuditModule {}
