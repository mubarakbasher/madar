import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { withTenantTx } from "../../shared/db-tx";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { CreateAdjustmentBody } from "./dto/create-adjustment.dto";
import type { ListMovementsQuery } from "./dto/list-movements.dto";

interface ApiAdjustmentResult {
  id: string;
  branch_id: string;
  product_id: string;
  kind: string;
  qty_delta: number;
  qty_on_hand: number;
  unit_cost_cents: string | null;
  note: string;
  occurred_at: string;
}

interface ApiMovementListItem {
  id: string;
  branch_id: string;
  branch_code: string;
  product_id: string;
  product_sku: string;
  product_name_en: string;
  kind: string;
  qty_delta: number;
  unit_cost_cents: string | null;
  reference_table: string | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string | null;
}

@Injectable()
export class StockService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Manual stock adjustment by a manager / owner. Writes a `stock_movements`
   * row and updates the `branch_stock` cache inside one transaction so the
   * ledger and cache cannot diverge. Negative deltas that would push qty below
   * zero are rejected — a separate "negative-stock override" flow lives in the
   * POS sell screen for offline scenarios, but manual back-office corrections
   * must keep the count non-negative.
   */
  async createAdjustment(
    tenantId: string,
    actorId: string,
    body: CreateAdjustmentBody,
    auditCtx: AuditCtx,
  ): Promise<ApiAdjustmentResult> {
    const scoped = tenantScoped(tenantId) as unknown as {
      branch: { findUnique: (args: { where: { id: string } }) => Promise<{ id: string; currency_code: string; deleted_at: Date | null } | null> };
      product: { findUnique: (args: { where: { id: string } }) => Promise<{ id: string; sku: string; deleted_at: Date | null } | null> };
    };

    const [branch, product] = await Promise.all([
      scoped.branch.findUnique({ where: { id: body.branch_id } }),
      scoped.product.findUnique({ where: { id: body.product_id } }),
    ]);
    if (!branch || branch.deleted_at) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }
    if (!product || product.deleted_at) {
      throw new NotFoundException({ code: "product_not_found", message: "Product not found" });
    }

    const { movementId, beforeQty, newQty } = await withTenantTx(tenantId, async (tx) => {
      // Lock the branch_stock row (if it exists) so concurrent adjustments
      // serialize and the negative-stock guard evaluates against the current
      // committed value, not a stale pre-transaction read.
      const locked = await tx.$queryRaw<Array<{ qty_on_hand: number }>>`
        SELECT qty_on_hand FROM branch_stock
         WHERE tenant_id = ${tenantId}::uuid
           AND branch_id = ${body.branch_id}::uuid
           AND product_id = ${body.product_id}::uuid
         FOR UPDATE`;
      const currentQty = locked[0]?.qty_on_hand ?? 0;
      const afterQty = currentQty + body.qty_delta;
      if (afterQty < 0) {
        throw new ConflictException({
          code: "negative_stock",
          message: `Adjustment would push qty_on_hand to ${afterQty}. Set qty_delta so it stays at zero or above.`,
          fields: { qty_delta: "negative_stock" },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenant_id: tenantId,
          branch_id: body.branch_id,
          product_id: body.product_id,
          kind: body.kind,
          qty_delta: body.qty_delta,
          unit_cost_cents:
            body.unit_cost_cents !== undefined ? BigInt(body.unit_cost_cents) : null,
          currency_code: branch.currency_code,
          note: body.note,
          created_by: actorId,
        },
      });
      const updated = await tx.branchStock.upsert({
        where: {
          tenant_id_branch_id_product_id: {
            tenant_id: tenantId,
            branch_id: body.branch_id,
            product_id: body.product_id,
          },
        },
        update: {
          qty_on_hand: { increment: body.qty_delta },
          last_movement_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          branch_id: body.branch_id,
          product_id: body.product_id,
          qty_on_hand: afterQty,
          last_movement_at: new Date(),
          created_by: actorId,
        },
      });
      return { movementId: movement.id, beforeQty: currentQty, newQty: updated.qty_on_hand };
    });

    await this.audit.writeTenantScoped(auditCtx, {
      action: "stock_adjusted",
      entity: "stock_movement",
      entityId: movementId,
      before: { qty_on_hand: beforeQty },
      after: {
        qty_on_hand: newQty,
        qty_delta: body.qty_delta,
        kind: body.kind,
        note: body.note,
        branch_id: body.branch_id,
        product_id: body.product_id,
      },
    });

    return {
      id: movementId,
      branch_id: body.branch_id,
      product_id: body.product_id,
      kind: body.kind,
      qty_delta: body.qty_delta,
      qty_on_hand: newQty,
      unit_cost_cents: body.unit_cost_cents !== undefined ? String(body.unit_cost_cents) : null,
      note: body.note,
      occurred_at: new Date().toISOString(),
    };
  }

  /**
   * Filterable read of the stock-movements ledger. Maps to PAGES.md §18.
   * Joins branch.code and product.sku/name via in-memory hydration so a single
   * paginated query stays cheap.
   */
  async listMovements(
    tenantId: string,
    q: ListMovementsQuery,
  ): Promise<{ items: ApiMovementListItem[]; total: number; page: number; limit: number }> {
    const scoped = tenantScoped(tenantId) as unknown as {
      stockMovement: {
        findMany: (args: unknown) => Promise<
          Array<{
            id: string;
            branch_id: string;
            product_id: string;
            kind: string;
            qty_delta: number;
            unit_cost_cents: bigint | null;
            reference_table: string | null;
            reference_id: string | null;
            note: string | null;
            occurred_at: Date;
            created_by: string | null;
          }>
        >;
        count: (args: unknown) => Promise<number>;
      };
      branch: { findMany: (args: unknown) => Promise<Array<{ id: string; code: string }>> };
      product: {
        findMany: (args: unknown) => Promise<Array<{ id: string; sku: string; name_i18n: unknown }>>;
      };
      user: {
        findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
      };
    };

    const where: Record<string, unknown> = {};
    if (q.branch_id) where.branch_id = q.branch_id;
    if (q.product_id) where.product_id = q.product_id;
    if (q.kind) where.kind = q.kind;
    if (q.reference_table) where.reference_table = q.reference_table;
    if (q.created_by) where.created_by = q.created_by;
    if (q.from || q.to) {
      const occurred_at: Record<string, Date> = {};
      if (q.from) {
        const d = new Date(q.from);
        if (Number.isNaN(d.getTime())) {
          throw new UnprocessableEntityException({ code: "invalid_from", message: "Invalid 'from' date" });
        }
        occurred_at.gte = d;
      }
      if (q.to) {
        const d = new Date(q.to);
        if (Number.isNaN(d.getTime())) {
          throw new UnprocessableEntityException({ code: "invalid_to", message: "Invalid 'to' date" });
        }
        occurred_at.lte = d;
      }
      where.occurred_at = occurred_at;
    }

    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      scoped.stockMovement.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        skip,
        take: q.limit,
      }),
      scoped.stockMovement.count({ where }),
    ]);

    if (rows.length === 0) {
      return { items: [], total, page: q.page, limit: q.limit };
    }

    const branchIds = Array.from(new Set(rows.map((r) => r.branch_id)));
    const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
    const userIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)),
    );
    // Prisma turns `in: []` into a no-op (returns []), so unconditional calls
    // are fine and they keep the per-call type inference clean (mixed tuples
    // through Promise.all confuse TS when one branch is a literal []).
    const branchesP = scoped.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, code: true },
    });
    const productsP = scoped.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name_i18n: true },
    });
    const usersP = scoped.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const branches = await branchesP;
    const products = await productsP;
    const users = await usersP;
    interface ProductMeta {
      sku: string;
      name_i18n: { en?: string; ar?: string } | null;
    }
    const branchById = new Map<string, string>(branches.map((b) => [b.id, b.code]));
    const productById = new Map<string, ProductMeta>(
      products.map((p) => [
        p.id,
        {
          sku: p.sku,
          name_i18n: (p.name_i18n as { en?: string; ar?: string } | null) ?? null,
        },
      ]),
    );
    const userById = new Map<string, string>(users.map((u) => [u.id, u.name]));

    return {
      items: rows.map((r) => {
        const product = productById.get(r.product_id);
        const nameI18n = product?.name_i18n ?? null;
        return {
          id: r.id,
          branch_id: r.branch_id,
          branch_code: branchById.get(r.branch_id) ?? "(deleted)",
          product_id: r.product_id,
          product_sku: product?.sku ?? "(deleted)",
          // Legacy fallthrough kept for back-compat with the product-detail page.
          product_name_en: nameI18n?.en ?? "",
          product_name_i18n: nameI18n
            ? { en: nameI18n.en ?? "", ar: nameI18n.ar ?? "" }
            : null,
          kind: r.kind,
          qty_delta: r.qty_delta,
          unit_cost_cents: r.unit_cost_cents?.toString() ?? null,
          reference_table: r.reference_table,
          reference_id: r.reference_id,
          note: r.note,
          occurred_at: r.occurred_at.toISOString(),
          created_by: r.created_by,
          created_by_name: r.created_by ? userById.get(r.created_by) ?? null : null,
        };
      }),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
}
