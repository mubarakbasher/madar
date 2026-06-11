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
// adminPrisma is used only to assemble the PDF input shape — the email
// processor (Task 3) does the same. PO mutations and reads use tenantScoped
// per CLAUDE.md. The `loadPdfInput`-style adminPrisma calls are deliberate and
// mirror the existing precedent (suppliers reads tenant.default_currency_code
// via adminPrisma for the same reason: cross-realm `tenants` lookup).
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { withTenantTx } from "../../shared/db-tx";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { PurchaseOrderPdfInput } from "../../shared/pdf/po-pdf.renderer";
import type { ListPurchaseOrdersQuery } from "./dto/list-po.dto";
import type {
  CreatePurchaseOrderBody,
  CreatePurchaseOrderLine,
} from "./dto/create-po.dto";
import type {
  UpdatePurchaseOrderBody,
  UpdatePurchaseOrderLine,
} from "./dto/update-po.dto";
import type { ReceivePurchaseOrderBody } from "./dto/receive-po.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

export type PoStatus = "draft" | "ordered" | "received" | "cancelled";

export interface ApiPoLine {
  id: string;
  product_id: string;
  product_sku: string | null;
  product_name_i18n: { en: string; ar: string } | null;
  qty_ordered: number;
  qty_received: number | null;
  unit_cost_cents: string;
  line_total_cents: string;
  discrepancy_note: string | null;
}

export interface ApiPoSummary {
  id: string;
  code: string;
  status: PoStatus;
  currency_code: string;
  expected_at: string | null;
  subtotal_cents: string;
  tax_cents: string;
  shipping_cents: string;
  total_cents: string;
  created_at: string;
  ordered_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  supplier: { id: string; code: string; name_i18n: { en: string; ar: string } | null };
  branch: { id: string; code: string | null; name_i18n: { en: string; ar: string } | null };
  line_count: number;
  has_discrepancy: boolean;
}

export interface ApiPoDetail extends ApiPoSummary {
  notes: string | null;
  supplier: {
    id: string;
    code: string;
    name_i18n: { en: string; ar: string } | null;
    contact_email: string | null;
  };
  lines: ApiPoLine[];
}

interface PoRow {
  id: string;
  code: string;
  supplier_id: string;
  branch_id: string;
  status: PoStatus;
  currency_code: string;
  expected_at: Date | null;
  subtotal_cents: bigint;
  tax_cents: bigint;
  shipping_cents: bigint;
  total_cents: bigint;
  notes: string | null;
  ordered_at: Date | null;
  received_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── role/branch gates ─────────────────────────────────────────────

  assertReader(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read purchase orders",
      });
    }
  }

  assertMutator(role: string): void {
    if (!MUTATOR_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can modify purchase orders",
      });
    }
  }

  /**
   * For writes: managers may only act on POs at their assigned branch. Owners
   * (and the accountant-on-reads case handled elsewhere) bypass.
   */
  assertBranchScope(role: string, userBranchId: string | null, poBranchId: string): void {
    if (role === "owner") return;
    if (role === "manager") {
      if (!userBranchId || userBranchId !== poBranchId) {
        throw new ForbiddenException({
          code: "forbidden_branch",
          message: "Managers may only act on purchase orders at their own branch",
        });
      }
      return;
    }
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only owners and managers can modify purchase orders",
    });
  }

  // ─── loaders ───────────────────────────────────────────────────────

  async loadPoOr404(tenantId: string, id: string): Promise<PoRow> {
    const row = await tenantScoped(tenantId).purchaseOrder.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "purchase_order_not_found",
        message: "Purchase order not found",
      });
    }
    return row as unknown as PoRow;
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListPurchaseOrdersQuery,
    /**
     * When provided, force-scopes the list to this branch even if the caller
     * passed a different `q.branch_id`. The controller passes the user's
     * branch_id for managers to prevent peek.
     */
    forcedBranchId: string | null,
  ): Promise<{ items: ApiPoSummary[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId);
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.status) where.status = q.status;
    if (q.supplier_id) where.supplier_id = q.supplier_id;
    if (forcedBranchId) where.branch_id = forcedBranchId;
    else if (q.branch_id) where.branch_id = q.branch_id;

    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      scoped.purchaseOrder.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: q.limit,
        include: { lines: { select: { qty_ordered: true, qty_received: true } } },
      }),
      scoped.purchaseOrder.count({ where }),
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
          r as unknown as PoRow,
          r.lines.map((l) => ({ qty_ordered: l.qty_ordered, qty_received: l.qty_received })),
          supplierById,
          branchById,
        ),
      ),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "purchase_order_not_found",
        message: "Purchase order not found",
      });
    }
    return this.assembleDetail(tenantId, row as unknown as PoRow & {
      lines: Array<{
        id: string;
        product_id: string;
        qty_ordered: number;
        qty_received: number | null;
        unit_cost_cents: bigint;
        line_total_cents: bigint;
        discrepancy_note: string | null;
      }>;
    });
  }

  // ─── create ────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreatePurchaseOrderBody,
    ctx: AuditCtx,
  ): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    this.assertNoDuplicateProducts(body.lines.map((l) => l.product_id));

    const supplier = await this.assertSupplierExists(tenantId, body.supplier_id);
    await this.assertBranchExists(tenantId, body.branch_id);
    await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));

    const lineResolutions = await this.resolveLineCosts(
      tenantId,
      body.supplier_id,
      body.lines,
    );

    // Snapshot currency from supplier.
    const currencyCode = supplier.currency_code;

    const subtotal = lineResolutions.reduce(
      (acc, l) => acc + BigInt(l.qty_ordered) * BigInt(l.unit_cost_cents),
      0n,
    );
    const taxCents = BigInt(body.tax_cents ?? 0);
    const shippingCents = BigInt(body.shipping_cents ?? 0);
    const totalCents = subtotal + taxCents + shippingCents;

    let createdId: string | null = null;
    for (let attempt = 0; attempt < 5 && !createdId; attempt++) {
      const code = this.generatePoCode();
      try {
        const result = await withTenantTx(tenantId, async (tx) => {
          const header = await tx.purchaseOrder.create({
            data: {
              tenant_id: tenantId,
              code,
              supplier_id: body.supplier_id,
              branch_id: body.branch_id,
              status: "draft",
              currency_code: currencyCode,
              expected_at: body.expected_at ? new Date(body.expected_at) : null,
              subtotal_cents: subtotal,
              tax_cents: taxCents,
              shipping_cents: shippingCents,
              total_cents: totalCents,
              notes: body.notes ?? null,
              created_by: actorId,
            },
          });
          for (const r of lineResolutions) {
            await tx.purchaseOrderLine.create({
              data: {
                tenant_id: tenantId,
                po_id: header.id,
                product_id: r.product_id,
                qty_ordered: r.qty_ordered,
                unit_cost_cents: BigInt(r.unit_cost_cents),
                line_total_cents: BigInt(r.qty_ordered) * BigInt(r.unit_cost_cents),
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
        code: "purchase_order_code_collision",
        message: "Could not allocate a unique purchase-order code — please retry",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_created",
        entity: "purchase_order",
        entityId: createdId,
        after: {
          code: (await scoped.purchaseOrder.findUnique({
            where: { id: createdId },
            select: { code: true },
          }))?.code ?? null,
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          line_count: lineResolutions.length,
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
    body: UpdatePurchaseOrderBody,
    ctx: AuditCtx,
  ): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadPoOr404(tenantId, id);
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "purchase_order_locked",
        message: `Cannot edit a purchase order in status ${existing.status}`,
      });
    }

    this.assertNoDuplicateProducts(body.lines.map((l) => l.product_id));
    const supplier = await this.assertSupplierExists(tenantId, body.supplier_id);
    await this.assertBranchExists(tenantId, body.branch_id);
    await this.assertProductsExist(tenantId, body.lines.map((l) => l.product_id));

    const lineResolutions = await this.resolveLineCosts(
      tenantId,
      body.supplier_id,
      body.lines,
    );
    const subtotal = lineResolutions.reduce(
      (acc, l) => acc + BigInt(l.qty_ordered) * BigInt(l.unit_cost_cents),
      0n,
    );
    const taxCents = BigInt(body.tax_cents ?? 0);
    const shippingCents = BigInt(body.shipping_cents ?? 0);
    const totalCents = subtotal + taxCents + shippingCents;

    await withTenantTx(tenantId, async (tx) => {
      // Guarded transition: claims the row only while still draft, so a
      // concurrent order/cancel/receive can't interleave (H-9).
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: "draft" },
        data: {
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          currency_code: supplier.currency_code,
          expected_at:
            body.expected_at === undefined
              ? undefined
              : body.expected_at === null
                ? null
                : new Date(body.expected_at),
          notes: body.notes === undefined ? undefined : body.notes,
          subtotal_cents: subtotal,
          tax_cents: taxCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: "purchase_order_state_changed",
          message:
            "Purchase order was modified by someone else — reload and retry.",
        });
      }
      // Replace lines wholesale (matches stock-transfer pattern).
      await tx.purchaseOrderLine.deleteMany({ where: { po_id: id } });
      for (const r of lineResolutions) {
        await tx.purchaseOrderLine.create({
          data: {
            tenant_id: tenantId,
            po_id: id,
            product_id: r.product_id,
            qty_ordered: r.qty_ordered,
            unit_cost_cents: BigInt(r.unit_cost_cents),
            line_total_cents: BigInt(r.qty_ordered) * BigInt(r.unit_cost_cents),
          },
        });
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_updated",
        entity: "purchase_order",
        entityId: id,
        after: {
          supplier_id: body.supplier_id,
          branch_id: body.branch_id,
          line_count: lineResolutions.length,
          total_cents: totalCents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  // ─── order (draft → ordered) ───────────────────────────────────────

  async order(
    tenantId: string,
    id: string,
    actorId: string,
    sendEmail: boolean,
    ctx: AuditCtx,
  ): Promise<{ po: ApiPoDetail; supplier_contact_email: string | null }> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadPoOr404(tenantId, id);
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "not_draft",
        message: `Cannot order a purchase order in status ${existing.status}`,
      });
    }

    // Guarded transition (H-9): only flips draft → ordered if still draft.
    const claimed = await scoped.purchaseOrder.updateMany({
      where: { id, status: "draft" },
      data: { status: "ordered", ordered_at: new Date(), ordered_by: actorId },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: "purchase_order_state_changed",
        message: "Purchase order was modified by someone else — reload and retry.",
      });
    }

    // Look up supplier contact email for the controller's email decision +
    // the audit metadata. Do this AFTER the transition succeeds so a missing
    // supplier (impossible — FK guarantees presence — but defensive) doesn't
    // mask the state-machine outcome.
    const supplier = await scoped.supplier.findUnique({
      where: { id: existing.supplier_id },
      select: { contact_email: true },
    });
    const recipient = supplier?.contact_email ?? null;

    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_ordered",
        entity: "purchase_order",
        entityId: id,
        after: {
          sent_email: sendEmail && !!recipient,
          recipient: sendEmail ? recipient : null,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return {
      po: await this.getOne(tenantId, id),
      supplier_contact_email: recipient,
    };
  }

  // ─── receive (ordered → received) ──────────────────────────────────

  async receive(
    tenantId: string,
    id: string,
    actorId: string,
    body: ReceivePurchaseOrderBody,
    ctx: AuditCtx,
  ): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({
        code: "purchase_order_not_found",
        message: "Purchase order not found",
      });
    }
    if (existing.status !== "ordered") {
      throw new ConflictException({
        code: "not_ordered",
        message: `Cannot receive a purchase order in status ${existing.status}`,
      });
    }

    // Validate body lines.
    const lineById = new Map(existing.lines.map((l) => [l.id, l]));
    const seen = new Set<string>();
    for (const r of body.lines) {
      if (!lineById.has(r.line_id)) {
        throw new UnprocessableEntityException({
          code: "unknown_line",
          message: `Unknown PO line: ${r.line_id}`,
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
      const missing = existing.lines
        .map((l) => l.id)
        .filter((lid) => !seen.has(lid));
      throw new UnprocessableEntityException({
        code: "incomplete_receive",
        message: "Every PO line must be included in the receive payload",
        fields: { missing_line_ids: missing },
      });
    }

    const now = new Date();
    await withTenantTx(tenantId, async (tx) => {
      // Guarded transition (H-9): atomically claims ordered → received BEFORE
      // any stock writes, so a concurrent receive can never double-increment
      // branch_stock or duplicate stock_movements.
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: "ordered" },
        data: { status: "received", received_at: now, received_by: actorId },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: "purchase_order_state_changed",
          message:
            "Purchase order was modified by someone else — reload and retry.",
        });
      }
      for (const r of body.lines) {
        const sourceLine = lineById.get(r.line_id)!;
        const isShort = r.qty_received < sourceLine.qty_ordered;
        const isOver = r.qty_received > sourceLine.qty_ordered;
        const isDiscrepant = isShort || isOver;
        let note: string | null = null;
        if (r.discrepancy_note !== undefined && r.discrepancy_note !== null) {
          note = r.discrepancy_note;
        } else if (isDiscrepant) {
          note = isShort ? "auto_short" : "auto_over";
        }
        await tx.purchaseOrderLine.update({
          where: { id: r.line_id },
          data: {
            qty_received: r.qty_received,
            discrepancy_note: note,
          },
        });
        if (r.qty_received > 0) {
          await tx.stockMovement.create({
            data: {
              tenant_id: tenantId,
              branch_id: existing.branch_id,
              product_id: sourceLine.product_id,
              kind: "receive",
              qty_delta: r.qty_received,
              unit_cost_cents: sourceLine.unit_cost_cents,
              reference_table: "purchase_orders",
              reference_id: id,
              created_by: actorId,
            },
          });
          await tx.branchStock.upsert({
            where: {
              tenant_id_branch_id_product_id: {
                tenant_id: tenantId,
                branch_id: existing.branch_id,
                product_id: sourceLine.product_id,
              },
            },
            update: {
              qty_on_hand: { increment: r.qty_received },
              last_movement_at: now,
            },
            create: {
              tenant_id: tenantId,
              branch_id: existing.branch_id,
              product_id: sourceLine.product_id,
              qty_on_hand: r.qty_received,
              last_movement_at: now,
              created_by: actorId,
            },
          });
        }
      }
    });

    const anyDiscrepant = body.lines.some((r) => {
      const src = lineById.get(r.line_id)!;
      return r.qty_received !== src.qty_ordered;
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_received",
        entity: "purchase_order",
        entityId: id,
        after: {
          discrepant: anyDiscrepant,
          lines_count: body.lines.length,
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
  ): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await this.loadPoOr404(tenantId, id);
    if (existing.status !== "draft") {
      throw new ConflictException({
        code: "not_draft",
        message: `Cannot cancel a purchase order in status ${existing.status} — only drafts can be cancelled`,
      });
    }
    // Guarded transition (H-9): only flips draft → cancelled if still draft.
    const claimed = await scoped.purchaseOrder.updateMany({
      where: { id, status: "draft" },
      data: { status: "cancelled", cancelled_at: new Date(), cancelled_by: actorId },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: "purchase_order_state_changed",
        message: "Purchase order was modified by someone else — reload and retry.",
      });
    }
    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_cancelled",
        entity: "purchase_order",
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
    const existing = await scoped.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: "purchase_order_not_found",
        message: "Purchase order not found",
      });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }
    if (existing.status !== "draft" && existing.status !== "cancelled") {
      throw new ConflictException({
        code: "not_deletable",
        message: "Only draft or cancelled purchase orders can be deleted",
      });
    }
    const now = new Date();
    await scoped.purchaseOrder.update({ where: { id }, data: { deleted_at: now } });
    await this.audit
      .writeTenantScoped(ctx, {
        action: "purchase_order_deleted",
        entity: "purchase_order",
        entityId: id,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    return { id, deleted_at: now.toISOString() };
  }

  // ─── pdf input assembly ────────────────────────────────────────────

  /**
   * Build the renderer's input shape for a PO. Mirrors the loader inside the
   * email processor (Task 3) but lives here because the PDF endpoint runs in
   * a tenant request context where `tenantScoped` is the canonical client.
   * The processor uses `adminPrisma` because it runs outside a tenant
   * request — both are correct for their context.
   */
  async assemblePdfInput(tenantId: string, poId: string): Promise<PurchaseOrderPdfInput> {
    const scoped = tenantScoped(tenantId);
    const po = await scoped.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        lines: { orderBy: { created_at: "asc" } },
        supplier: true,
      },
    });
    if (!po || po.deleted_at) {
      throw new NotFoundException({
        code: "purchase_order_not_found",
        message: "Purchase order not found",
      });
    }
    const [branch, tenant] = await Promise.all([
      scoped.branch.findUnique({ where: { id: po.branch_id } }),
      // tenants is a platform-scoped table, so it goes through adminPrisma.
      adminPrisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);
    if (!branch) {
      throw new NotFoundException({
        code: "branch_not_found",
        message: "Branch not found",
      });
    }
    if (!tenant) {
      throw new NotFoundException({
        code: "tenant_not_found",
        message: "Tenant not found",
      });
    }

    const productIds = po.lines.map((l) => l.product_id);
    const products = productIds.length
      ? await scoped.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sku: true, name_i18n: true },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    return {
      tenant: {
        name: pickI18nEn(tenant.name_i18n, tenant.name),
        address_lines: [],
      },
      po: {
        code: po.code,
        created_at: po.created_at,
        expected_at: po.expected_at,
        currency_code: po.currency_code,
        subtotal_cents: Number(po.subtotal_cents),
        tax_cents: Number(po.tax_cents),
        shipping_cents: Number(po.shipping_cents),
        total_cents: Number(po.total_cents),
        notes: po.notes,
      },
      supplier: {
        name: pickI18nEn(po.supplier.name_i18n, ""),
        contact_name: null,
        contact_email: po.supplier.contact_email,
        address_lines: pickI18nLines(po.supplier.address_i18n),
      },
      branch: {
        name: pickI18nEn(branch.name_i18n, ""),
        address_lines: pickI18nLines(branch.address_i18n),
      },
      lines: po.lines.map((l) => {
        const product = productById.get(l.product_id);
        return {
          sku: product?.sku ?? null,
          product_name: product
            ? pickI18nEn(product.name_i18n, product.sku ?? l.product_id)
            : l.product_id,
          qty_ordered: l.qty_ordered,
          unit_cost_cents: Number(l.unit_cost_cents),
          line_total_cents: Number(l.line_total_cents),
        };
      }),
    };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private summaryFromRow(
    row: PoRow,
    lines: Array<{ qty_ordered: number; qty_received: number | null }>,
    supplierById: Map<string, { id: string; code: string; name_i18n: unknown }>,
    branchById: Map<string, { id: string; code: string; name_i18n: unknown }>,
  ): ApiPoSummary {
    const supplier = supplierById.get(row.supplier_id);
    const branch = branchById.get(row.branch_id);
    const hasDiscrepancy =
      row.status === "received"
        ? lines.some(
            (l) => l.qty_received !== null && l.qty_received !== l.qty_ordered,
          )
        : false;
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      currency_code: row.currency_code,
      expected_at: row.expected_at
        ? row.expected_at.toISOString().slice(0, 10)
        : null,
      subtotal_cents: row.subtotal_cents.toString(),
      tax_cents: row.tax_cents.toString(),
      shipping_cents: row.shipping_cents.toString(),
      total_cents: row.total_cents.toString(),
      created_at: row.created_at.toISOString(),
      ordered_at: row.ordered_at ? row.ordered_at.toISOString() : null,
      received_at: row.received_at ? row.received_at.toISOString() : null,
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
      line_count: lines.length,
      has_discrepancy: hasDiscrepancy,
    };
  }

  private async assembleDetail(
    tenantId: string,
    row: PoRow & {
      lines: Array<{
        id: string;
        product_id: string;
        qty_ordered: number;
        qty_received: number | null;
        unit_cost_cents: bigint;
        line_total_cents: bigint;
        discrepancy_note: string | null;
      }>;
    },
  ): Promise<ApiPoDetail> {
    const scoped = tenantScoped(tenantId);
    const [supplier, branch, products] = await Promise.all([
      scoped.supplier.findUnique({
        where: { id: row.supplier_id },
        select: { id: true, code: true, name_i18n: true, contact_email: true },
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
      row.lines.map((l) => ({ qty_ordered: l.qty_ordered, qty_received: l.qty_received })),
      supplier
        ? new Map([[supplier.id, supplier]])
        : new Map<string, { id: string; code: string; name_i18n: unknown }>(),
      branch
        ? new Map([[branch.id, branch]])
        : new Map<string, { id: string; code: string; name_i18n: unknown }>(),
    );

    const lines: ApiPoLine[] = row.lines.map((l) => {
      const p = productById.get(l.product_id);
      return {
        id: l.id,
        product_id: l.product_id,
        product_sku: p?.sku ?? null,
        product_name_i18n: (p?.name_i18n as { en: string; ar: string } | null) ?? null,
        qty_ordered: l.qty_ordered,
        qty_received: l.qty_received,
        unit_cost_cents: l.unit_cost_cents.toString(),
        line_total_cents: l.line_total_cents.toString(),
        discrepancy_note: l.discrepancy_note,
      };
    });

    return {
      ...summary,
      notes: row.notes,
      supplier: {
        id: row.supplier_id,
        code: supplier?.code ?? "",
        name_i18n: (supplier?.name_i18n as { en: string; ar: string } | null) ?? null,
        contact_email: supplier?.contact_email ?? null,
      },
      lines,
    };
  }

  private generatePoCode(): string {
    // 6 chars from randomUUID — uppercase alphanumeric. Matches the transfers
    // pattern (`TXR-XXXXXX`) but with `PO-` prefix.
    return `PO-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  }

  private async assertSupplierExists(
    tenantId: string,
    supplierId: string,
  ): Promise<{ id: string; currency_code: string; contact_email: string | null }> {
    const supplier = await tenantScoped(tenantId).supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, currency_code: true, contact_email: true, deleted_at: true },
    });
    if (!supplier || supplier.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_supplier",
        message: "Supplier not found for this tenant",
        fields: { supplier_id: supplierId },
      });
    }
    return {
      id: supplier.id,
      currency_code: supplier.currency_code,
      contact_email: supplier.contact_email,
    };
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

  /**
   * Resolve unit_cost_cents for each input line. If the caller supplied one,
   * trust it. Otherwise look up `supplier_products` for the (supplier_id,
   * product_id) pair — missing rows raise `product_not_in_catalog`.
   */
  private async resolveLineCosts(
    tenantId: string,
    supplierId: string,
    lines: Array<CreatePurchaseOrderLine | UpdatePurchaseOrderLine>,
  ): Promise<Array<{ product_id: string; qty_ordered: number; unit_cost_cents: number }>> {
    const needsLookup = lines.filter((l) => l.unit_cost_cents === undefined);
    let costByProductId = new Map<string, bigint>();
    if (needsLookup.length > 0) {
      const rows = await tenantScoped(tenantId).supplierProduct.findMany({
        where: {
          supplier_id: supplierId,
          product_id: { in: needsLookup.map((l) => l.product_id) },
          deleted_at: null,
        },
        select: { product_id: true, unit_cost_cents: true },
      });
      costByProductId = new Map(rows.map((r) => [r.product_id, r.unit_cost_cents]));
    }

    return lines.map((l) => {
      if (l.unit_cost_cents !== undefined) {
        return {
          product_id: l.product_id,
          qty_ordered: l.qty_ordered,
          unit_cost_cents: l.unit_cost_cents,
        };
      }
      const cost = costByProductId.get(l.product_id);
      if (cost === undefined) {
        throw new UnprocessableEntityException({
          code: "product_not_in_catalog",
          message: `Product ${l.product_id} has no catalog entry for this supplier; supply unit_cost_cents explicitly`,
          fields: { product_id: l.product_id },
        });
      }
      // BigInt → number is safe here because catalog costs are bounded by zod
      // (max 1e12), well below Number.MAX_SAFE_INTEGER.
      return {
        product_id: l.product_id,
        qty_ordered: l.qty_ordered,
        unit_cost_cents: Number(cost),
      };
    });
  }
}

function pickI18nEn(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.en === "string" && obj.en.trim()) return obj.en;
    if (typeof obj.ar === "string" && obj.ar.trim()) return obj.ar;
  }
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function pickI18nLines(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const candidate = obj.en ?? obj.ar;
  if (Array.isArray(candidate)) {
    return candidate.filter((v): v is string => typeof v === "string");
  }
  if (typeof candidate === "string") {
    return candidate
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
