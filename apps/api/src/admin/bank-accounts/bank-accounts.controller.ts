import {
  Body,
  Controller,
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
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import {
  CreateBankAccountSchema,
  ListBankAccountsQuerySchema,
  UpdateBankAccountSchema,
  type CreateBankAccountInput,
  type ListBankAccountsQuery,
  type UpdateBankAccountInput,
} from "./dto/bank-account-schemas";
import { BankAccountsService } from "./bank-accounts.service";

@Controller("v1/admin/bank-accounts")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @Query(new ZodValidationPipe(ListBankAccountsQuerySchema)) query: ListBankAccountsQuery,
  ) {
    return this.bankAccounts.list(query);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.bankAccounts.get(id);
  }

  @Post()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body(new ZodValidationPipe(CreateBankAccountSchema)) body: CreateBankAccountInput,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.bankAccounts.create(body, buildCtx(admin, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateBankAccountSchema)) body: UpdateBankAccountInput,
    @Req() req: Request,
  ) {
    requireOwnerOrFinance(admin);
    return this.bankAccounts.update(id, body, buildCtx(admin, req));
  }

  @Post(":id/disable")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async disable(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.bankAccounts.setActive(id, false, buildCtx(admin, req));
  }

  @Post(":id/enable")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async enable(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.bankAccounts.setActive(id, true, buildCtx(admin, req));
  }

  @Post(":id/reveal")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async reveal(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    requireOwner(admin);
    return this.bankAccounts.reveal(id, buildCtx(admin, req));
  }
}

function requireOwner(admin: AdminPrincipal): void {
  if (admin.role !== "owner") {
    throw new ForbiddenException({
      code: "insufficient_permission",
      message: "Only the Platform Owner can perform this action.",
    });
  }
}

function requireOwnerOrFinance(admin: AdminPrincipal): void {
  if (admin.role !== "owner" && admin.role !== "finance") {
    throw new ForbiddenException({
      code: "insufficient_permission",
      message: "Only the Platform Owner or Finance can perform this action.",
    });
  }
}

function buildCtx(admin: AdminPrincipal, req: Request) {
  return {
    platformUserId: admin.platformUserId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}
