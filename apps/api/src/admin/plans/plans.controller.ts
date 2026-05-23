import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import {
  CreatePlanSchema,
  ListPlansQuerySchema,
  UpdatePlanSchema,
  type CreatePlanInput,
  type ListPlansQuery,
  type UpdatePlanInput,
} from "./dto/plan-schemas";
import { PlansService } from "./plans.service";

@Controller("v1/admin/plans")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(@Query(new ZodValidationPipe(ListPlansQuerySchema)) query: ListPlansQuery) {
    return this.plans.list(query);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.plans.get(id);
  }

  @Post()
  @RateLimit({ max: 20, windowMs: 60_000 })
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(new ZodValidationPipe(CreatePlanSchema)) body: CreatePlanInput,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.plans.create(body, buildCtx(admin, req));
  }

  @Patch(":id")
  @RateLimit({ max: 20, windowMs: 60_000 })
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePlanSchema)) body: UpdatePlanInput,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.plans.update(id, body, buildCtx(admin, req));
  }

  @Post(":id/deactivate")
  @RateLimit({ max: 20, windowMs: 60_000 })
  async deactivate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.plans.setActive(id, false, buildCtx(admin, req));
  }

  @Post(":id/activate")
  @RateLimit({ max: 20, windowMs: 60_000 })
  async activate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.plans.setActive(id, true, buildCtx(admin, req));
  }
}

function requireOwner(admin: AdminPrincipal): void {
  if (admin.role !== "owner") {
    throw new ForbiddenException({
      code: "insufficient_permission",
      message: "Only the Platform Owner can edit plans.",
    });
  }
}

function buildCtx(admin: AdminPrincipal, req: Request) {
  return {
    platformUserId: admin.platformUserId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}
