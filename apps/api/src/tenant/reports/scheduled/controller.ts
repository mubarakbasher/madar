import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../../auth/current-user.decorator";
import { ScheduledReportsService } from "./service";
import {
  CreateScheduledReportSchema,
  type CreateScheduledReportBody,
} from "./dto/create.dto";
import {
  UpdateScheduledReportSchema,
  type UpdateScheduledReportBody,
} from "./dto/update.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/scheduled-reports")
@UseGuards(RateLimitGuard)
export class ScheduledReportsController {
  constructor(private readonly service: ScheduledReportsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(@CurrentUser() user: TenantPrincipal) {
    this.service.assertCanRead(user.role);
    return this.service.list(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateScheduledReportSchema)) body: CreateScheduledReportBody,
    @Req() req: Request,
  ) {
    this.service.assertCanWrite(user.role);
    return this.service.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateScheduledReportSchema)) body: UpdateScheduledReportBody,
    @Req() req: Request,
  ) {
    this.service.assertCanWrite(user.role);
    return this.service.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Post(":id/run-now")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async runNow(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.service.assertCanWrite(user.role);
    return this.service.runNow(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.service.assertCanWrite(user.role);
    return this.service.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
