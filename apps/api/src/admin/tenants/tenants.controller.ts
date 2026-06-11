import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ListTenantsQuerySchema, type ListTenantsQuery } from "./dto/list-tenants.dto";
import {
  UpdateTenantStatusSchema,
  type UpdateTenantStatusInput,
} from "./dto/update-tenant-status.dto";
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

  @Patch(":id/status")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updateStatus(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTenantStatusSchema)) body: UpdateTenantStatusInput,
    @Req() req: Request,
  ) {
    if (admin.role !== "owner") {
      throw new ForbiddenException({
        code: "insufficient_permission",
        message: "Only the platform owner can override a tenant's lifecycle status",
      });
    }
    return this.tenants.updateStatus(id, body.status, body.reason, {
      platformUserId: admin.platformUserId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
