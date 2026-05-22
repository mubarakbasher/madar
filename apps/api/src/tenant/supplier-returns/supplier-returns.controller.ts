import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { z } from "zod";
import { tenantScoped } from "@madar/db";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { SupplierReturnsService } from "./supplier-returns.service";
import {
  ListSupplierReturnsQuerySchema,
  type ListSupplierReturnsQuery,
} from "./dto/list-returns.dto";
import {
  CreateSupplierReturnSchema,
  type CreateSupplierReturnBody,
} from "./dto/create-return.dto";
import {
  UpdateSupplierReturnSchema,
  type UpdateSupplierReturnBody,
} from "./dto/update-return.dto";

// Refund body is small enough to live inline — `notes` is optional and short.
const RefundBodySchema = z.object({
  notes: z.string().max(2000).optional(),
});
type RefundBody = z.infer<typeof RefundBodySchema>;

function buildCtx(user: TenantPrincipal, req: Request) {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
  };
}

async function fetchActorBranchId(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const me = await tenantScoped(tenantId).user.findUnique({
    where: { id: userId },
    select: { branch_id: true },
  });
  return me?.branch_id ?? null;
}

@Controller("v1/supplier-returns")
@UseGuards(RateLimitGuard)
export class SupplierReturnsController {
  constructor(private readonly returns: SupplierReturnsService) {}

  // ─── reads ─────────────────────────────────────────────────────────

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListSupplierReturnsQuerySchema)) q: ListSupplierReturnsQuery,
  ) {
    this.returns.assertReader(user.role);
    let forcedBranchId: string | null = null;
    if (user.role === "manager") {
      forcedBranchId = await fetchActorBranchId(user.tenantId, user.userId);
    }
    return this.returns.list(user.tenantId, q, forcedBranchId);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.returns.assertReader(user.role);
    const detail = await this.returns.getOne(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      // Reads on the wrong branch surface as 404 to avoid leaking existence.
      if (!branchId || branchId !== detail.branch.id) {
        throw new NotFoundException({
          code: "supplier_return_not_found",
          message: "Supplier return not found",
        });
      }
    }
    return detail;
  }

  // ─── mutations ─────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateSupplierReturnSchema)) body: CreateSupplierReturnBody,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, body.branch_id);
    }
    return this.returns.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateSupplierReturnSchema)) body: UpdateSupplierReturnBody,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    const existing = await this.returns.loadReturnOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, existing.branch_id);
      // Manager must also keep the return within their branch on update.
      this.returns.assertBranchScope(user.role, branchId, body.branch_id);
    }
    return this.returns.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Post(":id/send")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async send(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    const existing = await this.returns.loadReturnOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    return this.returns.send(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Post(":id/refund")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async refund(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RefundBodySchema)) body: RefundBody,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    const existing = await this.returns.loadReturnOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    return this.returns.refund(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async cancel(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    const existing = await this.returns.loadReturnOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    return this.returns.cancel(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.returns.assertMutator(user.role);
    assertNotImpersonating(user, "delete_supplier_return");
    // Soft-deleted rows still return 200 for idempotency; we need a tolerant
    // lookup for the manager branch check.
    const row = await tenantScoped(user.tenantId).supplierReturn.findUnique({
      where: { id },
      select: { branch_id: true },
    });
    if (row && user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.returns.assertBranchScope(user.role, branchId, row.branch_id);
    }
    return this.returns.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
