import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { tenantScoped } from "@madar/db";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { ShiftsService } from "./shifts.service";
import { OpenShiftSchema, type OpenShiftBody } from "./dto/open-shift.dto";
import { CloseShiftSchema, type CloseShiftBody } from "./dto/close-shift.dto";
import { ListShiftsQuerySchema, type ListShiftsQuery } from "./dto/list-shifts.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/shifts")
@UseGuards(RateLimitGuard)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get("current")
  @RateLimit({ max: 120, windowMs: 60_000 })
  async current(@CurrentUser() user: TenantPrincipal) {
    return this.shifts.getCurrent(user.tenantId, user.userId);
  }

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListShiftsQuerySchema)) q: ListShiftsQuery,
  ) {
    return this.shifts.list(user.tenantId, user.userId, user.role, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.shifts.getDetail(user.tenantId, user.userId, user.role, id);
  }

  @Post("open")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 10, windowMs: 60_000 })
  async open(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(OpenShiftSchema)) body: OpenShiftBody,
    @Req() req: Request,
  ) {
    // Look up the cashier's branch_id at open time so we can enforce
    // forbidden_branch when a cashier tries to open at a different branch.
    let branchId: string | null = null;
    if (user.role === "cashier") {
      const me = await tenantScoped(user.tenantId).user.findUnique({
        where: { id: user.userId },
        select: { branch_id: true },
      });
      branchId = me?.branch_id ?? null;
    }
    return this.shifts.open(
      user.tenantId,
      { userId: user.userId, role: user.role, branchId },
      body,
      buildCtx(user, req),
    );
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async close(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CloseShiftSchema)) body: CloseShiftBody,
    @Req() req: Request,
  ) {
    return this.shifts.close(
      user.tenantId,
      { userId: user.userId, role: user.role },
      id,
      body,
      buildCtx(user, req),
    );
  }
}
