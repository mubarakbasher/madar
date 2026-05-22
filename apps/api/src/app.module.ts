import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./health/health.module";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [CommonModule, HealthModule, TenantModule, AdminModule],
})
export class AppModule {}
