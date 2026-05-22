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
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { SaleRefundsService } from "./sale-refunds.service";
import { CreateRefundSchema, type CreateRefundBody } from "./dto/create-refund.dto";
import { ListRefundsQuerySchema, type ListRefundsQuery } from "./dto/list-refunds.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/sale-refunds")
@UseGuards(RateLimitGuard)
export class SaleRefundsController {
  constructor(private readonly refunds: SaleRefundsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListRefundsQuerySchema)) q: ListRefundsQuery,
  ) {
    return this.refunds.list(user.tenantId, user.userId, user.role, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.refunds.getOne(user.tenantId, user.role, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 20, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateRefundSchema)) body: CreateRefundBody,
    @Req() req: Request,
  ) {
    // CLAUDE.md: bulk customer refunds blocked during impersonation. We treat
    // every refund as protected — admin can't refund on the tenant's behalf.
    assertNotImpersonating(user, "create_refund");
    return this.refunds.create(
      user.tenantId,
      { userId: user.userId, role: user.role },
      body,
      buildCtx(user, req),
    );
  }
}
