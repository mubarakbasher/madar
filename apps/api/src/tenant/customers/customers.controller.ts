import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { CustomersService } from "./customers.service";
import { CreateCustomerSchema, type CreateCustomerBody } from "./dto/create-customer.dto";
import { UpdateCustomerSchema, type UpdateCustomerBody } from "./dto/update-customer.dto";
import { ListCustomersQuerySchema, type ListCustomersQuery } from "./dto/list-customers.dto";

const OWNER_ONLY = new Set(["owner"]);
const OWNER_OR_MANAGER = new Set(["owner", "manager"]);

function assertOwner(user: TenantPrincipal): void {
  if (!OWNER_ONLY.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only the owner can perform this action",
    });
  }
}

function assertOwnerOrManager(user: TenantPrincipal): void {
  if (!OWNER_OR_MANAGER.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers may modify customers",
    });
  }
}

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
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListCustomersQuerySchema)) q: ListCustomersQuery,
  ) {
    return this.customers.list(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.customers.getOne(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateCustomerSchema)) body: CreateCustomerBody,
    @Req() req: Request,
  ) {
    return this.customers.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCustomerSchema)) body: UpdateCustomerBody,
    @Req() req: Request,
  ) {
    assertOwnerOrManager(user);
    return this.customers.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertOwner(user);
    assertNotImpersonating(user, "delete_customer");
    return this.customers.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
