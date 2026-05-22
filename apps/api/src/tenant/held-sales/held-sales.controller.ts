import {
  Body,
  Controller,
  Delete,
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
import { HeldSalesService } from "./held-sales.service";
import {
  ListHeldSalesQuerySchema,
  type ListHeldSalesQuery,
} from "./dto/list.dto";
import { PutHeldSaleSchema, type PutHeldSaleBody } from "./dto/put.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/held-sales")
@UseGuards(RateLimitGuard)
export class HeldSalesController {
  constructor(private readonly heldSales: HeldSalesService) {}

  @Get()
  @RateLimit({ max: 120, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListHeldSalesQuerySchema)) q: ListHeldSalesQuery,
  ) {
    return this.heldSales.list(user.tenantId, user.userId, user.role, q);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(PutHeldSaleSchema)) body: PutHeldSaleBody,
    @Req() req: Request,
  ) {
    return this.heldSales.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 60, windowMs: 60_000 })
  async resume(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.heldSales.resume(
      user.tenantId,
      user.userId,
      user.role,
      id,
      buildCtx(user, req),
    );
  }

  @Delete(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async discard(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.heldSales.discard(
      user.tenantId,
      user.userId,
      user.role,
      id,
      buildCtx(user, req),
    );
  }
}
