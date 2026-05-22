import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ListTenantsQuerySchema, type ListTenantsQuery } from "./dto/list-tenants.dto";
import { TenantsService } from "./tenants.service";

@Controller("v1/admin/tenants")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(@Query(new ZodValidationPipe(ListTenantsQuerySchema)) query: ListTenantsQuery) {
    return this.tenants.listTenants(query);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.tenants.getTenantDetail(id);
  }
}
