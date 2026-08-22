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
import { QuotationsService } from "./quotations.service";
import { ListQuotationsQuerySchema, type ListQuotationsQuery } from "./dto/list.dto";
import { CreateQuotationSchema, type CreateQuotationBody } from "./dto/create.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/quotations")
@UseGuards(RateLimitGuard)
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  @RateLimit({ max: 120, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListQuotationsQuerySchema)) q: ListQuotationsQuery,
  ) {
    return this.quotations.list(user.tenantId, user.userId, user.role, q);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateQuotationSchema)) body: CreateQuotationBody,
    @Req() req: Request,
  ) {
    return this.quotations.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Get(":id")
  @RateLimit({ max: 120, windowMs: 60_000 })
  async detail(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.quotations.detail(user.tenantId, user.userId, user.role, id);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 60, windowMs: 60_000 })
  async cancel(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.quotations.cancel(
      user.tenantId,
      user.userId,
      user.role,
      id,
      buildCtx(user, req),
    );
  }
}
