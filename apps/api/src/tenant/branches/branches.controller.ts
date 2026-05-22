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
import { tenantScoped } from "@madar/db";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { BranchesService } from "./branches.service";
import { CreateBranchSchema, type CreateBranchBody } from "./dto/create-branch.dto";
import { UpdateBranchSchema, type UpdateBranchBody } from "./dto/update-branch.dto";
import { ListBranchesQuerySchema, type ListBranchesQuery } from "./dto/list-branches.dto";
import { BranchStockQuerySchema, type BranchStockQuery } from "./dto/stock-query.dto";

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
      message: "Only owners and managers may modify branches",
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

@Controller("v1/branches")
@UseGuards(RateLimitGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListBranchesQuerySchema)) q: ListBranchesQuery,
  ) {
    return this.branches.listForTenant(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.branches.getBranch(user.tenantId, id);
  }

  @Get(":id/stock")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getStock(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(BranchStockQuerySchema)) q: BranchStockQuery,
  ) {
    return this.branches.listBranchStock(user.tenantId, id, q);
  }

  @Get(":id/dashboard")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getDashboard(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.branches.getBranchDashboard(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateBranchSchema)) body: CreateBranchBody,
    @Req() req: Request,
  ) {
    assertOwner(user);
    return this.branches.createBranch(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateBranchSchema)) body: UpdateBranchBody,
    @Req() req: Request,
  ) {
    assertOwnerOrManager(user);
    if (user.role === "manager") {
      const me = await tenantScoped(user.tenantId).user.findUnique({
        where: { id: user.userId },
        select: { branch_id: true },
      });
      this.branches.assertCanWriteToBranch(
        { role: user.role, userId: user.userId },
        id,
        me?.branch_id ?? null,
      );
    }
    return this.branches.updateBranch(user.tenantId, id, body, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertOwner(user);
    assertNotImpersonating(user, "delete_branch");
    return this.branches.softDeleteBranch(user.tenantId, id, buildCtx(user, req));
  }
}
