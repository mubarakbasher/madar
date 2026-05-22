import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { StoreCreditService } from "./store-credit.service";
import { AdjustStoreCreditSchema, type AdjustStoreCreditBody } from "./dto/adjust.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/customers")
@UseGuards(RateLimitGuard)
export class StoreCreditController {
  constructor(private readonly storeCredit: StoreCreditService) {}

  @Get(":id/store-credit")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getSummary(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.storeCredit.assertCanRead(user.role);
    return this.storeCredit.getSummary(user.tenantId, id);
  }

  @Post(":id/store-credit/adjust")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async adjust(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AdjustStoreCreditSchema)) body: AdjustStoreCreditBody,
    @Req() req: Request,
  ) {
    this.storeCredit.assertCanMutate(user.role);
    return this.storeCredit.adjust(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }
}
