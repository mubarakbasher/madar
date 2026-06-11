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
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { CreateSaleSchema, type CreateSaleInput } from "./dto/create-sale.dto";
import { ListSalesQuerySchema, type ListSalesQuery } from "./dto/list-sales.dto";
import { SalesService } from "./sales.service";

@Controller("v1/sales")
@UseGuards(RateLimitGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateSaleSchema)) body: CreateSaleInput,
    @Req() req: Request,
  ) {
    return this.sales.completeSale(body, {
      tenantId: user.tenantId,
      cashierId: user.userId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      impersonatorId: user.impersonatorId,
    });
  }

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListSalesQuerySchema)) q: ListSalesQuery,
  ) {
    return this.sales.list(user.tenantId, user.userId, user.role, q);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.sales.getSale(user.tenantId, id, { userId: user.userId, role: user.role });
  }

  @Get(":id/receipt-data")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async receiptData(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.sales.getSaleForReceipt(user.tenantId, id, {
      userId: user.userId,
      role: user.role,
    });
  }
}
