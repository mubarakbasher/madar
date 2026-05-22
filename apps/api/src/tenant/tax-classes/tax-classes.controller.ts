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
import { TaxClassesService } from "./tax-classes.service";
import { ListTaxClassesQuerySchema, type ListTaxClassesQuery } from "./dto/list.dto";
import { CreateTaxClassSchema, type CreateTaxClassBody } from "./dto/create.dto";
import { UpdateTaxClassSchema, type UpdateTaxClassBody } from "./dto/update.dto";

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

@Controller("v1/tax-classes")
@UseGuards(RateLimitGuard)
export class TaxClassesController {
  constructor(private readonly taxClasses: TaxClassesService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListTaxClassesQuerySchema)) q: ListTaxClassesQuery,
  ) {
    this.taxClasses.assertCanRead(user.role);
    return this.taxClasses.list(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.taxClasses.assertCanRead(user.role);
    return this.taxClasses.getOne(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateTaxClassSchema)) body: CreateTaxClassBody,
    @Req() req: Request,
  ) {
    this.taxClasses.assertCanWrite(user.role);
    return this.taxClasses.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTaxClassSchema)) body: UpdateTaxClassBody,
    @Req() req: Request,
  ) {
    this.taxClasses.assertCanWrite(user.role);
    return this.taxClasses.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Post(":id/set-default")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async setDefault(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.taxClasses.assertCanWrite(user.role);
    return this.taxClasses.setDefault(user.tenantId, id, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.taxClasses.assertCanWrite(user.role);
    return this.taxClasses.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
