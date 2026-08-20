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
import { ReceivablesService } from "./receivables.service";
import { SettleReceivableSchema, type SettleReceivableBody } from "./dto/settle.dto";

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
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  @Get(":id/receivables")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getSummary(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.receivables.assertCanRead(user.role);
    return this.receivables.getSummary(user.tenantId, id);
  }

  @Post(":id/receivables/settle")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async settle(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SettleReceivableSchema)) body: SettleReceivableBody,
    @Req() req: Request,
  ) {
    this.receivables.assertCanMutate(user.role);
    return this.receivables.settle(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }
}
