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
import { withTenantTx } from "../../shared/db-tx";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { ListSupplierReturnsQuery } from "./dto/list-returns.dto";
import type {
  CreateSupplierReturnBody,
  CreateSupplierReturnLine,
} from "./dto/create-return.dto";
import type {
  UpdateSupplierReturnBody,
  UpdateSupplierReturnLine,
} from "./dto/update-return.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

export type SupplierReturnStatus = "draft" | "sent" | "refunded" | "cancelled";

export interface ApiReturnLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty: number;
  unit_cost_cents: string;
  line_total_cents: string;
  reason_code: string | null;
}

export interface ApiReturnSummary {
  id: string;
  code: string;
  status: SupplierReturnStatus;
  currency_code: string;
  total_cents: string;
  reason: string;
  created_at: string;
  sent_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
  supplier: { id: string; code: string; name_i18n: { en: string; ar: string } | null };
  branch: { id: string; code: string | null; name_i18n: { en: string; ar: string } | null };
  line_count: number;
}

export interface ApiReturnDetail extends ApiReturnSummary {
  notes: string | null;
  lines: ApiReturnLine[];
}

interface ReturnRow {
  id: string;
  code: string;
  supplier_id: string;
  branch_id: string;
  status: SupplierReturnStatus;
  currency_code: string;
  total_cents: bigint;
  reason: string;
  notes: string | null;
  sent_at: Date | null;
  refunded_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class SupplierReturnsService {
  private readonly logger = new Logger(SupplierReturnsService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── role/branch gates ─────────────────────────────────────────────

  assertReader(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read supplier returns",
      });
    }
  }

  assertMutator(role: string): void {
    if (!MUTATOR_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can modify supplier returns",
      });
    }
  }

  /**
   * For writes: managers may only act on returns at their assigned branch.
   * Owners bypass. Mirrors the PO branch-scope contract.
   */
  assertBranchScope(role: string, userBranchId: string | null, returnBranchId: string): void {
    if (role === "owner") return;
    if (role === "manager") {
      if (!userBranchId || userBranchId !== returnBranchId) {
        throw new ForbiddenException({
          code: "forbidden_branch",
          message: "Managers may only act on supplier returns at their own branch",
        });
      }
      return;
    }
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers can modify supplier returns",
    });
  }

  // ─── loaders ───────────────────────────────────────────────────────

  async loadReturnOr404(tenantId: string, id: string): Promise<ReturnRow> {
    const row = await tenantScoped(tenantId).supplierReturn.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "supplier_return_not_found",
        message: "Supplier return not found",
      });
    }
    return row as unknown as ReturnRow;
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListSupplierReturnsQuery,
    /** When provided, force-scopes the list to this branch (manager). */
    forcedBranchId: string | null,
  ): Promise<{ items: ApiReturnSummary[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.status) where.status = q.status;
    if (q.supplier_id) where.supplier_id = q.supplier_id;
    if (forcedBranchId) where.branch_id = forcedBranchId;
    else if (q.branch_id) where.branch_id = q.branch_id;

    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      scoped.supplierReturn.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: q.limit,
        include: { lines: { select: { id: true } } },
      }),
      scoped.supplierReturn.count({ where }),
    ]);

    const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id)));
    const branchIds = Array.from(new Set(rows.map((r) => r.branch_id)));
    const [suppliers, branches] = await Promise.all([
      supplierIds.length
        ? scoped.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, code: true, name_i18n: true },
          })
        : Promise.resolve([] as Array<{ id: string; code: string; name_i18n: unknown }>),
      branchIds.length
        ? scoped.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, code: true, name_i18n: true },
          })
        : Promise.resolve([] as Array<{ id: string; code: string; name_i18n: unknown }>),
    ]);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const branchById = new Map(branches.map((b) => [b.id, b]));

    return {
      items: rows.map((r) =>
        this.summaryFromRow(
          r as unknown as ReturnRow,
          r.lines.length,
          supplierById,
          branchById,
        ),
      ),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.supplierReturn.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "supplier_return_not_found",
        message: "Supplier return not found",
      });
    }
    return this.assembleDetail(
      tenantId,
      row as unknown as ReturnRow & {
        lines: Array<{
          id: string;
          product_id: string;
          qty: number;
          unit_cost_cents: bigint;
          line_total_cents: bigint;
          reason_code: string | null;
        }>;
      },
    );
  }

  // ─── create ────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateSupplierReturnBody,
    ctx: AuditCtx,
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    this.assertNoDuplicateProducts(body.lines.map((l) => l.product_id));

    const supplier = await this.assertSupplierExists(tenantId, body.supplier_id);
    await this.assertBranchExists(tenantId, body.branch_id);
    await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));

    // Snapshot currency from supplier (matches PO flow).
    const currencyCode = supplier.currency_code;

    const totalCents = body.lines.reduce(
      (acc, l) => acc + BigInt(l.qty) * BigInt(l.unit_cost_cents),
      0n,
    );

    let createdId: string | null = null;
    for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
      const code = this.generateRmaCode();
      try {
        const result = await withTenantTx(tenantId, async (tx) => {
          const header = await tx.supplierReturn.create({
            data: {
              tenant_id: tenantId,
              code,
              supplier_id: body.supplier_id,
              branch_id: body.branch_id,
              status: "draft",
              currency_code: currencyCode,
              total_cents: totalCents,
              reason: body.reason,
              notes: body.notes ?? null,
              created_by: actorId,
            },
          });
          for (const l of body.lines) {
            await tx.supplierReturnLine.create({
              data: {
                tenant_id: tenantId,
                return_id: header.id,
                product_id: l.product_id,
                qty: l.qty,
                unit_cost_cents: BigInt(l.unit_cost_cents),
                line_total_cents: BigInt(l.qty) * BigInt(l.unit_cost_cents),
                reason_code: l.reason_code ?? null,
                created_by: actorId,
              },
            });
          }
          return header;
        });
        createdId = result.id;
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === "P2002") continue;
        throw err;
      }
    }
    if (!createdId) {
      throw new ConflictException({
        code: "supplier_return_code_collision",
        message: "Could not allocate a unique supplier-return code — please retry",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_created",
        entity: "supplier_return",
        entityId: createdId,
        after: {
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          line_count: body.lines.length,
          total_cents: totalCents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, createdId);
  }

  // ─── update (draft only) ───────────────────────────────────────────

  async update(
    tenantId: string,
    id: string,
    body: UpdateSupplierReturnBody,
    ctx: AuditCtx,
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadReturnOr404(tenantId, id);
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "not_draft",
        message: `Cannot edit a supplier return in status ${existing.status}`,
      });
    }

    this.assertNoDuplicateProducts(body.lines.map((l) => l.product_id));
    const supplier = await this.assertSupplierExists(tenantId, body.supplier_id);
    await this.assertBranchExists(tenantId, body.branch_id);
    await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));

    const totalCents = body.lines.reduce(
      (acc, l) => acc + BigInt(l.qty) * BigInt(l.unit_cost_cents),
      0n,
    );

    await withTenantTx(tenantId, async (tx) => {
      // Guarded transition: claims the row only while still draft, so a
      // concurrent send/cancel can't interleave (H-9).
      const claimed = await tx.supplierReturn.updateMany({
        where: { id, status: "draft" },
        data: {
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          currency_code: supplier.currency_code,
          reason: body.reason,
          notes: body.notes === undefined ? undefined : body.notes,
          total_cents: totalCents,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: "supplier_return_state_changed",
          message:
            "Supplier return was modified by someone else — reload and retry.",
        });
      }
      // Replace lines wholesale.
      await tx.supplierReturnLine.deleteMany({ where: { return_id: id } });
      for (const l of body.lines) {
        await tx.supplierReturnLine.create({
          data: {
            tenant_id: tenantId,
            return_id: id,
            product_id: l.product_id,
            qty: l.qty,
            unit_cost_cents: BigInt(l.unit_cost_cents),
            line_total_cents: BigInt(l.qty) * BigInt(l.unit_cost_cents),
            reason_code: l.reason_code ?? null,
          },
        });
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_updated",
        entity: "supplier_return",
        entityId: id,
        after: {
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          line_count: body.lines.length,
          total_cents: totalCents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  // ─── send (draft → sent) ───────────────────────────────────────────

  /**
   * Transition draft → sent. Decrements inventory at the source branch by
   * writing one `stock_movements` row per line with `kind='adjustment'` and
   * `reference_table='supplier_returns'` — the reference_table disambiguates
   * the adjustment from a manual stock correction.
   *
   * `branch_stock.qty_on_hand` is allowed to go negative — returns may happen
   * while accounting is mid-correction. A future stock-reconciliation slice
   * will surface negative on-hand for review.
   */
  async send(
    tenantId: string,
    id: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.supplierReturn.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({
        code: "supplier_return_not_found",
        message: "Supplier return not found",
      });
    }
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "not_draft",
        message: `Cannot send a supplier return in status ${existing.status}`,
      });
    }

    const now = new Date();
    const sent = await withTenantTx(tenantId, async (tx) => {
      // Guarded transition (H-9): atomically claims draft → sent BEFORE any
      // stock writes, so a concurrent send can never double-decrement
      // branch_stock or duplicate stock_movements.
      const claimed = await tx.supplierReturn.updateMany({
        where: { id, status: "draft" },
        data: { status: "sent", sent_at: now, sent_by: actorId },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: "supplier_return_state_changed",
          message:
            "Supplier return was modified by someone else — reload and retry.",
        });
      }
      // Re-read inside the tx: a concurrent draft edit may have replaced the
      // lines after the pre-read above. Same connection → consistent view.
      const current = await tx.supplierReturn.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });
      for (const line of current.lines) {
        await tx.stockMovement.create({
          data: {
            tenant_id: tenantId,
            branch_id: current.branch_id,
            product_id: line.product_id,
            kind: "adjustment",
            qty_delta: -line.qty,
            unit_cost_cents: line.unit_cost_cents,
            reference_table: "supplier_returns",
            reference_id: id,
            created_by: actorId,
          },
        });
        await tx.branchStock.upsert({
          where: {
            tenant_id_branch_id_product_id: {
              tenant_id: tenantId,
              branch_id: current.branch_id,
              product_id: line.product_id,
            },
          },
          update: {
            qty_on_hand: { decrement: line.qty },
            last_movement_at: now,
          },
          create: {
            tenant_id: tenantId,
            branch_id: current.branch_id,
            product_id: line.product_id,
            // Negative starting on-hand is intentional — see method doc.
            qty_on_hand: -line.qty,
            last_movement_at: now,
            created_by: actorId,
          },
        });
      }
      return current;
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_sent",
        entity: "supplier_return",
        entityId: id,
        after: {
          lines_count: sent.lines.length,
          total_cents: sent.total_cents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  // ─── refund (sent → refunded) ──────────────────────────────────────

  /**
   * Transition sent → refunded. Bookkeeping only — supplier has acknowledged
   * the refund. No stock movement. Optional `notes` are *appended* to the
   * existing notes with a separator (safer than replacing — preserves the
   * prior context the verifier may have entered earlier).
   */
  async refund(
    tenantId: string,
    id: string,
    actorId: string,
    body: { notes?: string },
    ctx: AuditCtx,
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadReturnOr404(tenantId, id);
    if (existing.status !== "sent") {
      throw new ConflictException({
        code: "not_sent",
        message: `Cannot refund a supplier return in status ${existing.status}`,
      });
    }

    const now = new Date();
    let mergedNotes: string | null | undefined = undefined;
    if (body.notes !== undefined && body.notes.trim().length > 0) {
      const appended = `[refund ${now.toISOString()}] ${body.notes.trim()}`;
      mergedNotes = existing.notes ? `${existing.notes}\n${appended}` : appended;
    }

    // Guarded transition (H-9): only flips sent → refunded if still sent.
    const claimed = await scoped.supplierReturn.updateMany({
      where: { id, status: "sent" },
      data: {
        status: "refunded",
        refunded_at: now,
        refunded_by: actorId,
        ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: "supplier_return_state_changed",
        message: "Supplier return was modified by someone else — reload and retry.",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_refunded",
        entity: "supplier_return",
        entityId: id,
        after: {
          notes_appended: mergedNotes !== undefined,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  // ─── cancel (draft only) ───────────────────────────────────────────

  async cancel(
    tenantId: string,
    id: string,
    actorId: string,
    ctx: AuditCtx,
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadReturnOr404(tenantId, id);
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "not_draft",
        message: `Cannot cancel a supplier return in status ${existing.status} — only drafts can be cancelled`,
      });
    }
    // Guarded transition (H-9): only flips draft → cancelled if still draft.
    const claimed = await scoped.supplierReturn.updateMany({
      where: { id, status: "draft" },
      data: { status: "cancelled", cancelled_at: new Date(), cancelled_by: actorId },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: "supplier_return_state_changed",
        message: "Supplier return was modified by someone else — reload and retry.",
      });
    }
    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_cancelled",
        entity: "supplier_return",
        entityId: id,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    return this.getOne(tenantId, id);
  }

  // ─── soft delete ───────────────────────────────────────────────────

  async softDelete(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.supplierReturn.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: "supplier_return_not_found",
        message: "Supplier return not found",
      });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }
    if (existing.status !== "draft" && existing.status !== "cancelled") {
      throw new ConflictException({
        code: "not_deletable",
        message: "Only draft or cancelled supplier returns can be deleted",
      });
    }
    const now = new Date();
    await scoped.supplierReturn.update({ where: { id }, data: { deleted_at: now } });
    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_return_deleted",
        entity: "supplier_return",
        entityId: id,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    return { id, deleted_at: now.toISOString() };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private summaryFromRow(
    row: ReturnRow,
    lineCount: number,
    supplierById: Map<string, { id: string; code: string; name_i18n: unknown }>,
    branchById: Map<string, { id: string; code: string; name_i18n: unknown }>,
  ): ApiReturnSummary {
    const supplier = supplierById.get(row.supplier_id);
    const branch = branchById.get(row.branch_id);
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      currency_code: row.currency_code,
      total_cents: row.total_cents.toString(),
      reason: row.reason,
      created_at: row.created_at.toISOString(),
      sent_at: row.sent_at ? row.sent_at.toISOString() : null,
      refunded_at: row.refunded_at ? row.refunded_at.toISOString() : null,
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      supplier: {
        id: row.supplier_id,
        code: supplier?.code ?? "",
        name_i18n: (supplier?.name_i18n as { en: string; ar: string } | null) ?? null,
      },
      branch: {
        id: row.branch_id,
        code: branch?.code ?? null,
        name_i18n: (branch?.name_i18n as { en: string; ar: string } | null) ?? null,
      },
      line_count: lineCount,
    };
  }

  private async assembleDetail(
    tenantId: string,
    row: ReturnRow & {
      lines: Array<{
        id: string;
        product_id: string;
        qty: number;
        unit_cost_cents: bigint;
        line_total_cents: bigint;
        reason_code: string | null;
      }>;
    },
  ): Promise<ApiReturnDetail> {
    const scoped = tenantScoped(tenantId);
    const [supplier, branch, products] = await Promise.all([
      scoped.supplier.findUnique({
        where: { id: row.supplier_id },
        select: { id: true, code: true, name_i18n: true },
      }),
      scoped.branch.findUnique({
        where: { id: row.branch_id },
        select: { id: true, code: true, name_i18n: true },
      }),
      scoped.product.findMany({
        where: { id: { in: row.lines.map((l) => l.product_id) } },
        select: { id: true, sku: true, name_i18n: true },
      }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const summary = this.summaryFromRow(
      row,
      row.lines.length,
      supplier
        ? new Map([[supplier.id, supplier]])
        : new Map<string, { id: string; code: string; name_i18n: unknown }>(),
      branch
        ? new Map([[branch.id, branch]])
        : new Map<string, { id: string; code: string; name_i18n: unknown }>(),
    );

    const lines: ApiReturnLine[] = row.lines.map((l) => {
      const p = productById.get(l.product_id);
      return {
        id: l.id,
        product_id: l.product_id,
        product_sku: p?.sku ?? null,
        product_name_i18n: (p?.name_i18n as { en: string; ar: string } | null) ?? null,
        qty: l.qty,
        unit_cost_cents: l.unit_cost_cents.toString(),
        line_total_cents: l.line_total_cents.toString(),
        reason_code: l.reason_code,
      };
    });

    return { ...summary, notes: row.notes, lines };
  }

  private generateRmaCode(): string {
    // 6 chars from randomUUID — uppercase alphanumeric. Matches PO/transfer pattern.
    return `RMA-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  }

  private async assertSupplierExists(
    tenantId: string,
    supplierId: string,
  ): Promise<{ id: string; currency_code: string }> {
    const supplier = await tenantScoped(tenantId).supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, currency_code: true, deleted_at: true },
    });
    if (!supplier || supplier.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_supplier",
        message: "Supplier not found for this tenant",
        fields: { supplier_id: supplierId },
      });
    }
    return { id: supplier.id, currency_code: supplier.currency_code };
  }

  private async assertBranchExists(tenantId: string, branchId: string): Promise<void> {
    const branch = await tenantScoped(tenantId).branch.findUnique({
      where: { id: branchId },
      select: { id: true, deleted_at: true },
    });
    if (!branch || branch.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "Branch not found for this tenant",
        fields: { branch_id: branchId },
      });
    }
  }

  private async assertProductsExist(tenantId: string, ids: string[]): Promise<void> {
    const unique = Array.from(new Set(ids));
    const products = await tenantScoped(tenantId).product.findMany({
      where: { id: { in: unique }, deleted_at: null },
      select: { id: true },
    });
    const known = new Set(products.map((p) => p.id));
    for (const id of unique) {
      if (!known.has(id)) {
        throw new UnprocessableEntityException({
          code: "unknown_product",
          message: `Product not found: ${id}`,
          fields: { product_id: id },
        });
      }
    }
  }

  private assertNoDuplicateProducts(ids: string[]): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        throw new BadRequestException({
          code: "duplicate_product",
          message: `Product ${id} appears more than once in lines`,
          fields: { product_id: id },
        });
      }
      seen.add(id);
    }
  }
}

// Re-export DTO types for callers that need them at runtime (matches PO module).
export type {
  CreateSupplierReturnLine,
  UpdateSupplierReturnLine,
};
