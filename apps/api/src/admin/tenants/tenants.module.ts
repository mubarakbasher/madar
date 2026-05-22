import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
