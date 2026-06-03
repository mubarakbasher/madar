import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { ListTransfersQuery } from "./dto/list-transfers.dto";
import type { CreateTransferBody } from "./dto/create-transfer.dto";
import type { UpdateTransferBody } from "./dto/update-transfer.dto";
import type { ReceiveTransferBody } from "./dto/receive-transfer.dto";

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface ApiTransferLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty_sent: number;
  qty_received: number | null;
  discrepancy_note: string | null;
}

export interface ApiTransferSummary {
  id: string;
  code: string;
  from_branch_id: string;
  from_branch_code: string | null;
  from_branch_name_i18n: { en: string; ar: string } | null;
  to_branch_id: string;
  to_branch_code: string | null;
  to_branch_name_i18n: { en: string; ar: string } | null;
  status: TransferStatus;
  notes: string | null;
  line_count: number;
  total_qty_sent: number;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
}

export interface ApiTransferDetail extends ApiTransferSummary {
  lines: ApiTransferLine[];
  has_discrepancy: boolean;
}

@Injectable()
export class StockTransfersService {
  private readonly logger = new Logger(StockTransfersService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── reads ─────────────────────────────────────────────────────────

  async list(tenantId: string, q: ListTransfersQuery): Promise<{
    items: ApiTransferSummary[];
    total: number;
    page: number;
    limit: number;
  }> {
    const scoped = tenantScoped(tenantId);
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.status) where.status = q.status;
    if (q.from_branch_id) where.from_branch_id = q.from_branch_id;
    if (q.to_branch_id) where.to_branch_id = q.to_branch_id;

    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      scoped.stockTransfer.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: q.limit,
        include: { lines: { select: { qty_sent: true } } },
      }),
      scoped.stockTransfer.count({ where }),
    ]);

    const branchIds = Array.from(
      new Set(rows.flatMap((r) => [r.from_branch_id, r.to_branch_id])),
    );
    const branches = branchIds.length
      ? await scoped.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, code: true, name_i18n: true },
        })
      : [];
    const branchById = new Map(branches.map((b) => [b.id, b]));

    return {
      items: rows.map((r) => this.summaryFromRow(r, branchById)),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.stockTransfer.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }

    const [fromBranch, toBranch, products] = await Promise.all([
      scoped.branch.findUnique({
        where: { id: row.from_branch_id },
        select: { id: true, code: true, name_i18n: true },
      }),
      scoped.branch.findUnique({
        where: { id: row.to_branch_id },
        select: { id: true, code: true, name_i18n: true },
      }),
      scoped.product.findMany({
        where: { id: { in: row.lines.map((l) => l.product_id) } },
        select: { id: true, sku: true, name_i18n: true },
      }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const branchById = new Map<string, { code: string; name_i18n: unknown }>();
    if (fromBranch) branchById.set(fromBranch.id, fromBranch);
    if (toBranch) branchById.set(toBranch.id, toBranch);

    const summary = this.summaryFromRow(
      { ...row, lines: row.lines.map((l) => ({ qty_sent: l.qty_sent })) },
      branchById,
    );

    const lines: ApiTransferLine[] = row.lines.map((l) => {
      const p = productById.get(l.product_id);
      return {
        id: l.id,
        product_id: l.product_id,
        product_sku: p?.sku ?? null,
        product_name_i18n: (p?.name_i18n as { en: string; ar: string } | null) ?? null,
        qty_sent: l.qty_sent,
        qty_received: l.qty_received,
        discrepancy_note: l.discrepancy_note,
      };
    });

    const hasDiscrepancy = lines.some(
      (l) => l.qty_received !== null && l.qty_received !== l.qty_sent,
    );

    return { ...summary, lines, has_discrepancy: hasDiscrepancy };
  }

  // ─── mutations ──────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateTransferBody,
    ctx: AuditCtx,
  ): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    await this.assertBranchesExist(tenantId, [body.from_branch_id, body.to_branch_id]);
    await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));
    this.assertNoDuplicateProducts(body.lines);

    let createdId: string | null = null;
    for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
      const code = `TXR-${randomUUID().slice(0, 6).toUpperCase()}`;
      try {
        const tx = await scoped.$transaction(async (tx) => {
          const header = await tx.stockTransfer.create({
            data: {
              tenant_id: tenantId,
              code,
              from_branch_id: body.from_branch_id,
              to_branch_id: body.to_branch_id,
              status: "draft",
              notes: body.notes ?? null,
              created_by: actorId,
            },
          });
          for (const l of body.lines) {
            await tx.stockTransferLine.create({
              data: {
                tenant_id: tenantId,
                transfer_id: header.id,
                product_id: l.product_id,
                qty_sent: l.qty_sent,
              },
            });
          }
          return header;
        });
        createdId = tx.id;
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === "P2002") continue;
        throw err;
      }
    }
    if (!createdId) {
      throw new ConflictException({
        code: "transfer_code_collision",
        message: "Could not allocate a unique transfer code — please retry",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_created",
        entity: "stock_transfer",
        entityId: createdId,
        after: {
          from_branch_id: body.from_branch_id,
          to_branch_id: body.to_branch_id,
          line_count: body.lines.length,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, createdId);
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateTransferBody,
    ctx: AuditCtx,
  ): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.stockTransfer.findUnique({ where: { id } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "transfer_not_editable",
        message: `Cannot edit transfer in status ${existing.status}`,
      });
    }
    if (body.lines) {
      await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));
      this.assertNoDuplicateProducts(body.lines);
    }

    await scoped.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (body.notes !== undefined) data.notes = body.notes;
      if (Object.keys(data).length) {
        await tx.stockTransfer.update({ where: { id }, data });
      }
      if (body.lines) {
        await tx.stockTransferLine.deleteMany({ where: { transfer_id: id } });
        for (const l of body.lines) {
          await tx.stockTransferLine.create({
            data: {
              tenant_id: tenantId,
              transfer_id: id,
              product_id: l.product_id,
              qty_sent: l.qty_sent,
            },
          });
        }
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_updated",
        entity: "stock_transfer",
        entityId: id,
        after: { lines: body.lines?.length ?? undefined, notes: body.notes ?? undefined },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  async send(
    tenantId: string,
    id: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.stockTransfer.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "transfer_not_sendable",
        message: `Cannot send transfer in status ${existing.status}`,
      });
    }
    if (existing.lines.length === 0) {
      throw new UnprocessableEntityException({
        code: "transfer_empty",
        message: "Cannot send a transfer with no lines",
      });
    }

    await scoped.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: { id },
        data: { status: "in_transit", sent_at: new Date(), sent_by: actorId },
      });
      for (const line of existing.lines) {
        await tx.stockMovement.create({
          data: {
            tenant_id: tenantId,
            branch_id: existing.from_branch_id,
            product_id: line.product_id,
            kind: "transfer_out",
            qty_delta: -line.qty_sent,
            reference_table: "stock_transfers",
            reference_id: id,
            created_by: actorId,
          },
        });
        await tx.branchStock.upsert({
          where: {
            tenant_id_branch_id_product_id: {
              tenant_id: tenantId,
              branch_id: existing.from_branch_id,
              product_id: line.product_id,
            },
          },
          update: {
            qty_on_hand: { decrement: line.qty_sent },
            last_movement_at: new Date(),
          },
          create: {
            tenant_id: tenantId,
            branch_id: existing.from_branch_id,
            product_id: line.product_id,
            qty_on_hand: -line.qty_sent,
            last_movement_at: new Date(),
            created_by: actorId,
          },
        });
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_sent",
        entity: "stock_transfer",
        entityId: id,
        after: { from_branch_id: existing.from_branch_id, line_count: existing.lines.length },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  async receive(
    tenantId: string,
    id: string,
    actorId: string,
    body: ReceiveTransferBody,
    ctx: AuditCtx,
  ): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.stockTransfer.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }
    if (existing.status !== "in_transit") {
      throw new ConflictException({
        code: "transfer_not_receivable",
        message: `Cannot receive transfer in status ${existing.status}`,
      });
    }

    const lineById = new Map(existing.lines.map((l) => [l.id, l]));
    const seen = new Set<string>();
    for (const r of body.lines) {
      if (!lineById.has(r.line_id)) {
        throw new UnprocessableEntityException({
          code: "unknown_line",
          message: `Unknown transfer line: ${r.line_id}`,
        });
      }
      if (seen.has(r.line_id)) {
        throw new BadRequestException({
          code: "duplicate_line",
          message: `Duplicate receive entry for line ${r.line_id}`,
        });
      }
      seen.add(r.line_id);
    }
    if (seen.size !== existing.lines.length) {
      throw new UnprocessableEntityException({
        code: "incomplete_receive",
        message: "Every transfer line must be included in the receive payload",
      });
    }

    await scoped.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: { id },
        data: { status: "received", received_at: new Date(), received_by: actorId },
      });
      for (const r of body.lines) {
        const sourceLine = lineById.get(r.line_id)!;
        const discrepant = r.qty_received !== sourceLine.qty_sent;
        await tx.stockTransferLine.update({
          where: { id: r.line_id },
          data: {
            qty_received: r.qty_received,
            discrepancy_note: discrepant ? r.discrepancy_note ?? null : null,
          },
        });
        if (r.qty_received > 0) {
          await tx.stockMovement.create({
            data: {
              tenant_id: tenantId,
              branch_id: existing.to_branch_id,
              product_id: sourceLine.product_id,
              kind: "transfer_in",
              qty_delta: r.qty_received,
              reference_table: "stock_transfers",
              reference_id: id,
              created_by: actorId,
            },
          });
          await tx.branchStock.upsert({
            where: {
              tenant_id_branch_id_product_id: {
                tenant_id: tenantId,
                branch_id: existing.to_branch_id,
                product_id: sourceLine.product_id,
              },
            },
            update: {
              qty_on_hand: { increment: r.qty_received },
              last_movement_at: new Date(),
            },
            create: {
              tenant_id: tenantId,
              branch_id: existing.to_branch_id,
              product_id: sourceLine.product_id,
              qty_on_hand: r.qty_received,
              last_movement_at: new Date(),
              created_by: actorId,
            },
          });
        }
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_received",
        entity: "stock_transfer",
        entityId: id,
        after: {
          to_branch_id: existing.to_branch_id,
          line_count: body.lines.length,
          discrepant: body.lines.some((r) => r.qty_received !== lineById.get(r.line_id)!.qty_sent),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  async cancel(
    tenantId: string,
    id: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<ApiTransferDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.stockTransfer.findUnique({ where: { id } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "transfer_not_cancellable",
        message: `Cannot cancel transfer in status ${existing.status} — only drafts can be cancelled`,
      });
    }

    await scoped.stockTransfer.update({
      where: { id },
      data: { status: "cancelled", cancelled_at: new Date(), cancelled_by: actorId },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_cancelled",
        entity: "stock_transfer",
        entityId: id,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  async softDelete(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.stockTransfer.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: "transfer_not_found", message: "Transfer not found" });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }
    if (existing.status !== "draft" && existing.status !== "cancelled") {
      throw new ConflictException({
        code: "transfer_not_deletable",
        message: "Only draft or cancelled transfers can be deleted",
      });
    }
    const now = new Date();
    await scoped.stockTransfer.update({ where: { id }, data: { deleted_at: now } });
    await this.audit
      .writeTenantScoped(ctx, {
        action: "stock_transfer_deleted",
        entity: "stock_transfer",
        entityId: id,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    return { id, deleted_at: now.toISOString() };
  }

  /**
   * Owner: any branch. Manager: only when their assigned branch matches the
   * required side. The source branch (or owner) owns the draft lifecycle
   * (create / update / send / cancel / delete); the destination branch (or
   * owner) owns receive. Callers pass the branch the action belongs to:
   * `from_branch_id` for the draft lifecycle, `to_branch_id` for receive.
   */
  assertActorBranch(
    actor: { role: string; userId: string; branchId: string | null },
    requiredBranchId: string,
  ): void {
    if (actor.role === "owner") return;
    if (actor.role !== "manager") {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can act on transfers",
      });
    }
    if (!actor.branchId || actor.branchId !== requiredBranchId) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "You can only act on transfers for your assigned branch",
      });
    }
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private summaryFromRow(
    row: {
      id: string;
      code: string;
      from_branch_id: string;
      to_branch_id: string;
      status: TransferStatus;
      notes: string | null;
      lines: Array<{ qty_sent: number }>;
      created_at: Date;
      sent_at: Date | null;
      received_at: Date | null;
      cancelled_at: Date | null;
    },
    branchById: Map<string, { code: string; name_i18n: unknown }>,
  ): ApiTransferSummary {
    const from = branchById.get(row.from_branch_id);
    const to = branchById.get(row.to_branch_id);
    return {
      id: row.id,
      code: row.code,
      from_branch_id: row.from_branch_id,
      from_branch_code: from?.code ?? null,
      from_branch_name_i18n: (from?.name_i18n as { en: string; ar: string } | null) ?? null,
      to_branch_id: row.to_branch_id,
      to_branch_code: to?.code ?? null,
      to_branch_name_i18n: (to?.name_i18n as { en: string; ar: string } | null) ?? null,
      status: row.status,
      notes: row.notes,
      line_count: row.lines.length,
      total_qty_sent: row.lines.reduce((s, l) => s + l.qty_sent, 0),
      created_at: row.created_at.toISOString(),
      sent_at: row.sent_at ? row.sent_at.toISOString() : null,
      received_at: row.received_at ? row.received_at.toISOString() : null,
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    };
  }

  private async assertBranchesExist(tenantId: string, ids: string[]): Promise<void> {
    const scoped = tenantScoped(tenantId);
    const branches = await scoped.branch.findMany({
      where: { id: { in: ids }, deleted_at: null },
      select: { id: true },
    });
    const known = new Set(branches.map((b) => b.id));
    for (const id of ids) {
      if (!known.has(id)) {
        throw new UnprocessableEntityException({
          code: "unknown_branch",
          message: `Branch not found: ${id}`,
        });
      }
    }
  }

  private async assertProductsExist(tenantId: string, ids: string[]): Promise<void> {
    const unique = Array.from(new Set(ids));
    const scoped = tenantScoped(tenantId);
    const products = await scoped.product.findMany({
      where: { id: { in: unique }, deleted_at: null },
      select: { id: true },
    });
    const known = new Set(products.map((p) => p.id));
    for (const id of unique) {
      if (!known.has(id)) {
        throw new UnprocessableEntityException({
          code: "unknown_product",
          message: `Product not found: ${id}`,
        });
      }
    }
  }

  private assertNoDuplicateProducts(lines: Array<{ product_id: string }>): void {
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.product_id)) {
        throw new BadRequestException({
          code: "duplicate_product",
          message: `Product ${l.product_id} appears more than once`,
        });
      }
      seen.add(l.product_id);
    }
  }
}
