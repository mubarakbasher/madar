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
import { StockTransfersService } from "./stock-transfers.service";
import { ListTransfersQuerySchema, type ListTransfersQuery } from "./dto/list-transfers.dto";
import { CreateTransferSchema, type CreateTransferBody } from "./dto/create-transfer.dto";
import { UpdateTransferSchema, type UpdateTransferBody } from "./dto/update-transfer.dto";
import { ReceiveTransferSchema, type ReceiveTransferBody } from "./dto/receive-transfer.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);

function assertMutator(user: TenantPrincipal): void {
  if (!MUTATOR_ROLES.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers can move stock between branches",
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

async function fetchActorBranchId(tenantId: string, userId: string): Promise<string | null> {
  const me = await tenantScoped(tenantId).user.findUnique({
    where: { id: userId },
    select: { branch_id: true },
  });
  return me?.branch_id ?? null;
}

@Controller("v1/stock-transfers")
@UseGuards(RateLimitGuard)
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListTransfersQuerySchema)) q: ListTransfersQuery,
  ) {
    return this.transfers.list(user.tenantId, q);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.transfers.getOne(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreateTransferSchema)) body: CreateTransferBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    const branchId = await fetchActorBranchId(user.tenantId, user.userId);
    this.transfers.assertCanAct(
      { role: user.role, userId: user.userId, branchId },
      { from_branch_id: body.from_branch_id, to_branch_id: body.to_branch_id },
    );
    return this.transfers.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTransferSchema)) body: UpdateTransferBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    const transfer = await this.transfers.getOne(user.tenantId, id);
    const branchId = await fetchActorBranchId(user.tenantId, user.userId);
    this.transfers.assertCanAct(
      { role: user.role, userId: user.userId, branchId },
      { from_branch_id: transfer.from_branch_id, to_branch_id: transfer.to_branch_id },
    );
    return this.transfers.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Post(":id/send")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async send(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    const transfer = await this.transfers.getOne(user.tenantId, id);
    const branchId = await fetchActorBranchId(user.tenantId, user.userId);
    // Sender (from_branch) confirms dispatch.
    if (user.role === "manager" && branchId !== transfer.from_branch_id) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "Only a manager at the sender branch can dispatch",
      });
    }
    return this.transfers.send(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Post(":id/receive")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async receive(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReceiveTransferSchema)) body: ReceiveTransferBody,
    @Req() req: Request,
  ) {
    assertMutator(user);
    const transfer = await this.transfers.getOne(user.tenantId, id);
    const branchId = await fetchActorBranchId(user.tenantId, user.userId);
    if (user.role === "manager" && branchId !== transfer.to_branch_id) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "Only a manager at the receiver branch can confirm receipt",
      });
    }
    return this.transfers.receive(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async cancel(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    const transfer = await this.transfers.getOne(user.tenantId, id);
    const branchId = await fetchActorBranchId(user.tenantId, user.userId);
    this.transfers.assertCanAct(
      { role: user.role, userId: user.userId, branchId },
      { from_branch_id: transfer.from_branch_id, to_branch_id: transfer.to_branch_id },
    );
    return this.transfers.cancel(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    assertMutator(user);
    assertNotImpersonating(user, "delete_stock_transfer");
    // Use a lightweight RLS-scoped fetch that includes soft-deleted rows so
    // the second idempotent DELETE doesn't 404 just because deleted_at is set.
    const row = await tenantScoped(user.tenantId).stockTransfer.findUnique({
      where: { id },
      select: { from_branch_id: true, to_branch_id: true },
    });
    if (row) {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.transfers.assertCanAct(
        { role: user.role, userId: user.userId, branchId },
        { from_branch_id: row.from_branch_id, to_branch_id: row.to_branch_id },
      );
    }
    return this.transfers.softDelete(user.tenantId, id, buildCtx(user, req));
  }
}
