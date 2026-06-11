import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { withTenantTx } from "../../shared/db-tx";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { ListHeldSalesQuery } from "./dto/list.dto";
import type { HeldSaleLineBody, PutHeldSaleBody } from "./dto/put.dto";

const BRANCH_WIDE_ROLES = new Set(["owner", "manager"]);

export interface ApiHeldSaleSummary {
  id: string;
  name: string;
  note: string | null;
  branch_id: string;
  cashier_id: string;
  cashier_name: string;
  customer_id: string | null;
  customer_name: string | null;
  line_count: number;
  total_cents: string;
  currency_code: string;
  held_at: string;
}

export interface ApiHeldSaleLine {
  product_id: string;
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  note: string | null;
}

export interface ApiHeldSalePayload {
  id: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  name: string;
  note: string | null;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  currency_code: string;
  held_at: string;
  resumed_at: string | null;
  lines: ApiHeldSaleLine[];
}

@Injectable()
export class HeldSalesService {
  private readonly logger = new Logger(HeldSalesService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── reads ─────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    actorId: string,
    role: string,
    q: ListHeldSalesQuery,
  ): Promise<{ items: ApiHeldSaleSummary[]; total: number }> {
    const scoped = tenantScoped(tenantId);

    // Cashiers always scoped to themselves regardless of the mine_only flag.
    // owner/manager honor the flag (default = mine_only=true so the tray on a
    // shared register still defaults to "yours").
    const restrictToSelf = !BRANCH_WIDE_ROLES.has(role) || q.mine_only;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      branch_id: q.branch_id,
      deleted_at: null,
      resumed_at: null,
      discarded_at: null,
      held_at: { gt: twentyFourHoursAgo },
    };
    if (restrictToSelf) {
      where.cashier_id = actorId;
    }

    const rows = await scoped.heldSale.findMany({
      where,
      orderBy: { held_at: "desc" },
      include: { lines: { select: { id: true } } },
    });

    if (rows.length === 0) return { items: [], total: 0 };

    const cashierIds = Array.from(new Set(rows.map((r) => r.cashier_id)));
    const customerIds = Array.from(
      new Set(rows.map((r) => r.customer_id).filter((v): v is string => v !== null)),
    );

    const [cashiers, customers] = await Promise.all([
      cashierIds.length
        ? scoped.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? scoped.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const cashierById = new Map(cashiers.map((u) => [u.id, u.name]));
    const customerById = new Map(customers.map((c) => [c.id, c.name]));

    const items: ApiHeldSaleSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      branch_id: r.branch_id,
      cashier_id: r.cashier_id,
      cashier_name: cashierById.get(r.cashier_id) ?? "",
      customer_id: r.customer_id,
      customer_name: r.customer_id ? customerById.get(r.customer_id) ?? null : null,
      line_count: r.lines.length,
      total_cents: r.total_cents.toString(),
      currency_code: r.currency_code,
      held_at: r.held_at.toISOString(),
    }));

    return { items, total: items.length };
  }

  // ─── create ────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: PutHeldSaleBody,
    ctx: AuditCtx,
  ): Promise<ApiHeldSalePayload> {
    const scoped = tenantScoped(tenantId);

    // Sanity-check FK targets are visible under tenant scope (RLS would 404
    // them too on the FK, but a clean 422 is friendlier than a Prisma error).
    const branch = await scoped.branch.findUnique({
      where: { id: body.branch_id },
      select: { id: true, deleted_at: true },
    });
    if (!branch || branch.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "Branch not found for this tenant",
      });
    }
    if (body.customer_id) {
      const customer = await scoped.customer.findUnique({
        where: { id: body.customer_id },
        select: { id: true, deleted_at: true },
      });
      if (!customer || customer.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_customer",
          message: "Customer not found for this tenant",
        });
      }
    }

    const productIds = Array.from(new Set(body.lines.map((l) => l.product_id)));
    const products = await scoped.product.findMany({
      where: { id: { in: productIds }, deleted_at: null },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new UnprocessableEntityException({
        code: "unknown_product",
        message: "One or more products are not in the catalog",
      });
    }

    const created = await withTenantTx(tenantId, async (tx) => {
      const held = await tx.heldSale.create({
        data: {
          tenant_id: tenantId,
          branch_id: body.branch_id,
          cashier_id: actorId,
          customer_id: body.customer_id ?? null,
          name: body.name,
          note: body.note ?? null,
          subtotal_cents: BigInt(body.subtotal_cents),
          discount_cents: BigInt(body.discount_cents),
          tax_cents: BigInt(body.tax_cents),
          total_cents: BigInt(body.total_cents),
          currency_code: body.currency_code,
          created_by: actorId,
        },
      });
      for (const line of body.lines) {
        await tx.heldSaleLine.create({
          data: {
            tenant_id: tenantId,
            held_sale_id: held.id,
            product_id: line.product_id,
            qty: line.qty,
            unit_price_cents: BigInt(line.unit_price_cents),
            discount_cents: BigInt(line.discount_cents ?? "0"),
            note: line.note ?? null,
          },
        });
      }
      return held;
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "held_sale_created",
        entity: "held_sale",
        entityId: created.id,
        after: {
          branch_id: created.branch_id,
          cashier_id: created.cashier_id,
          line_count: body.lines.length,
          total_cents: body.total_cents,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toPayload(tenantId, created.id);
  }

  // ─── resume ────────────────────────────────────────────────────────

  async resume(
    tenantId: string,
    actorId: string,
    role: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<ApiHeldSalePayload> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.heldSale.findUnique({ where: { id } });
    if (!row || row.deleted_at || row.discarded_at) {
      throw new NotFoundException({
        code: "held_sale_not_found",
        message: "Held sale not found",
      });
    }
    this.assertCanAccess(row.cashier_id, actorId, role);

    if (row.resumed_at) {
      // Idempotent — return the same payload without a second mutation or
      // audit row. Lets the client safely retry under flaky networks.
      return this.toPayload(tenantId, id);
    }

    await scoped.heldSale.update({
      where: { id },
      data: { resumed_at: new Date() },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "held_sale_resumed",
        entity: "held_sale",
        entityId: id,
        after: { resumed_by: actorId },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toPayload(tenantId, id);
  }

  // ─── discard ───────────────────────────────────────────────────────

  async discard(
    tenantId: string,
    actorId: string,
    role: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; discarded_at: string }> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.heldSale.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "held_sale_not_found",
        message: "Held sale not found",
      });
    }
    this.assertCanAccess(row.cashier_id, actorId, role);

    if (row.discarded_at) {
      return { id, discarded_at: row.discarded_at.toISOString() };
    }

    const now = new Date();
    await scoped.heldSale.update({
      where: { id },
      data: { discarded_at: now },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "held_sale_discarded",
        entity: "held_sale",
        entityId: id,
        before: {
          cashier_id: row.cashier_id,
          line_total_cents: row.total_cents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id, discarded_at: now.toISOString() };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private assertCanAccess(ownerId: string, actorId: string, role: string): void {
    if (ownerId === actorId) return;
    if (BRANCH_WIDE_ROLES.has(role)) return;
    throw new ForbiddenException({
      code: "forbidden_not_owner",
      message: "You can only act on your own held sales",
    });
  }

  private async toPayload(tenantId: string, id: string): Promise<ApiHeldSalePayload> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.heldSale.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { created_at: "asc" },
          select: {
            product_id: true,
            qty: true,
            unit_price_cents: true,
            discount_cents: true,
            note: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: "held_sale_not_found",
        message: "Held sale not found",
      });
    }
    return {
      id: row.id,
      branch_id: row.branch_id,
      cashier_id: row.cashier_id,
      customer_id: row.customer_id,
      name: row.name,
      note: row.note,
      subtotal_cents: row.subtotal_cents.toString(),
      discount_cents: row.discount_cents.toString(),
      tax_cents: row.tax_cents.toString(),
      total_cents: row.total_cents.toString(),
      currency_code: row.currency_code,
      held_at: row.held_at.toISOString(),
      resumed_at: row.resumed_at ? row.resumed_at.toISOString() : null,
      lines: row.lines.map(
        (l): ApiHeldSaleLine => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents.toString(),
          discount_cents: l.discount_cents.toString(),
          note: l.note,
        }),
      ),
    };
  }
}

// Re-export for controller convenience.
export type { HeldSaleLineBody };
