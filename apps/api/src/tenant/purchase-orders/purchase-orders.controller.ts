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
  Res,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { tenantScoped } from "@madar/db";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { assertNotImpersonating } from "../auth/impersonation.helper";
import { renderPurchaseOrderPdf } from "../../shared/pdf/po-pdf.renderer";
import { PurchaseOrdersService } from "./purchase-orders.service";
import {
  ListPurchaseOrdersQuerySchema,
  type ListPurchaseOrdersQuery,
} from "./dto/list-po.dto";
import {
  CreatePurchaseOrderSchema,
  type CreatePurchaseOrderBody,
} from "./dto/create-po.dto";
import {
  UpdatePurchaseOrderSchema,
  type UpdatePurchaseOrderBody,
} from "./dto/update-po.dto";
import {
  OrderPurchaseOrderSchema,
  type OrderPurchaseOrderBody,
} from "./dto/order-po.dto";
import {
  ReceivePurchaseOrderSchema,
  type ReceivePurchaseOrderBody,
} from "./dto/receive-po.dto";
import { SendPoEmailQueue } from "./jobs/send-po-email.queue";

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

@Controller("v1/purchase-orders")
@UseGuards(RateLimitGuard)
export class PurchaseOrdersController {
  constructor(
    private readonly pos: PurchaseOrdersService,
    private readonly sendEmailQueue: SendPoEmailQueue,
  ) {}

  // ─── reads ─────────────────────────────────────────────────────────

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListPurchaseOrdersQuerySchema)) q: ListPurchaseOrdersQuery,
  ) {
    this.pos.assertReader(user.role);
    let forcedBranchId: string | null = null;
    if (user.role === "manager") {
      forcedBranchId = await fetchActorBranchId(user.tenantId, user.userId);
    }
    return this.pos.list(user.tenantId, q, forcedBranchId);
  }

  @Get(":id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getOne(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    this.pos.assertReader(user.role);
    const po = await this.pos.getOne(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      // Reads on the wrong branch surface as 404 to avoid leaking existence.
      if (!branchId || branchId !== po.branch.id) {
        throw new NotFoundException({
          code: "purchase_order_not_found",
          message: "Purchase order not found",
        });
      }
    }
    return po;
  }

  // ─── mutations ─────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async create(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(CreatePurchaseOrderSchema)) body: CreatePurchaseOrderBody,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, body.branch_id);
    }
    return this.pos.create(user.tenantId, user.userId, body, buildCtx(user, req));
  }

  @Patch(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async update(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePurchaseOrderSchema)) body: UpdatePurchaseOrderBody,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    const existing = await this.pos.loadPoOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, existing.branch_id);
      // Manager must also keep the PO within their branch on update.
      this.pos.assertBranchScope(user.role, branchId, body.branch_id);
    }
    return this.pos.update(user.tenantId, id, body, buildCtx(user, req));
  }

  @Post(":id/order")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async order(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(OrderPurchaseOrderSchema)) body: OrderPurchaseOrderBody,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    const existing = await this.pos.loadPoOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    const sendEmail = body.send_email === true;
    const { po, supplier_contact_email } = await this.pos.order(
      user.tenantId,
      id,
      user.userId,
      sendEmail,
      buildCtx(user, req),
    );
    if (sendEmail && supplier_contact_email) {
      // The enqueue helper carries inline-fallback behavior — failures here
      // do not undo the state transition (matches the design: the PO IS
      // ordered; the email is a notification side-effect).
      try {
        await this.sendEmailQueue.enqueue({
          tenantId: user.tenantId,
          purchaseOrderId: id,
          triggeredByUserId: user.userId,
          toEmail: supplier_contact_email,
        });
      } catch (err) {
        // Logged inside the queue helper; swallow so the API response still reflects success.
        void err;
      }
    }
    return po;
  }

  @Post(":id/receive")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async receive(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReceivePurchaseOrderSchema)) body: ReceivePurchaseOrderBody,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    const existing = await this.pos.loadPoOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    return this.pos.receive(user.tenantId, id, user.userId, body, buildCtx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async cancel(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    const existing = await this.pos.loadPoOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, existing.branch_id);
    }
    return this.pos.cancel(user.tenantId, id, user.userId, buildCtx(user, req));
  }

  @Delete(":id")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async remove(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    this.pos.assertMutator(user.role);
    assertNotImpersonating(user, "delete_purchase_order");
    // Lightweight RLS-scoped lookup that includes soft-deleted rows so the
    // second idempotent DELETE doesn't 404 just because `deleted_at` is set.
    const row = await tenantScoped(user.tenantId).purchaseOrder.findUnique({
      where: { id },
      select: { branch_id: true },
    });
    if (row && user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      this.pos.assertBranchScope(user.role, branchId, row.branch_id);
    }
    return this.pos.softDelete(user.tenantId, id, buildCtx(user, req));
  }

  // ─── PDF ──────────────────────────────────────────────────────────

  @Get(":id/pdf")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async pdf(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    this.pos.assertReader(user.role);
    const existing = await this.pos.loadPoOr404(user.tenantId, id);
    if (user.role === "manager") {
      const branchId = await fetchActorBranchId(user.tenantId, user.userId);
      if (!branchId || branchId !== existing.branch_id) {
        throw new NotFoundException({
          code: "purchase_order_not_found",
          message: "Purchase order not found",
        });
      }
    }
    const input = await this.pos.assemblePdfInput(user.tenantId, id);
    const pdf = await renderPurchaseOrderPdf(input);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(existing.code)}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_");
}
