import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
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
import { StockService } from "./stock.service";
import {
  CreateAdjustmentSchema,
  type CreateAdjustmentBody,
} from "./dto/create-adjustment.dto";
import {
  ListMovementsQuerySchema,
  type ListMovementsQuery,
} from "./dto/list-movements.dto";

const ADJUST_ROLES = new Set(["owner", "manager"]);
const READ_ROLES = new Set(["owner", "manager", "auditor", "accountant"]);

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1")
@UseGuards(RateLimitGuard)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Post("stock-adjustments")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async createAdjustment(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateAdjustmentSchema)) body: CreateAdjustmentBody,
    @Req() req: Request,
  ) {
    if (!ADJUST_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can adjust stock",
      });
    }
    return this.stock.createAdjustment(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Get("stock-movements")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listMovements(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListMovementsQuerySchema)) q: ListMovementsQuery,
  ) {
    if (!READ_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You don't have access to the stock-movements ledger",
      });
    }
    return this.stock.listMovements(user.tenantId, q);
  }
}
