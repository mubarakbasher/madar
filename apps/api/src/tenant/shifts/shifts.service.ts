import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { OpenShiftBody } from "./dto/open-shift.dto";
import type { CloseShiftBody } from "./dto/close-shift.dto";
import type { ListShiftsQuery } from "./dto/list-shifts.dto";

const READ_ROLES = new Set(["owner", "manager", "auditor", "accountant", "cashier"]);

export interface ApiCashierShift {
  id: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string;
  cashier_name: string | null;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  opening_float_cents: string;
  declared_closing_cash_cents: string | null;
  expected_closing_cash_cents: string | null;
  variance_cents: string | null;
  currency_code: string;
  notes: string | null;
  status: "open" | "closed";
}

export interface ZReportPaymentBreakdown {
  method: string;
  count: number;
  amount_cents: string;
}

export interface ZReportTopProduct {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  units: number;
  revenue_cents: string;
}

export interface ApiShiftDetail extends ApiCashierShift {
  z_report: {
    transactions: number;
    items_sold: number;
    gross_revenue_cents: string;
    cash_sales_cents: string;
    cash_refunds_cents: string;
    by_payment: ZReportPaymentBreakdown[];
    top_products: ZReportTopProduct[];
  };
}

interface RawShiftRow {
  id: string;
  branch_id: string;
  cashier_id: string;
  opened_at: Date;
  opened_by: string;
  closed_at: Date | null;
  closed_by: string | null;
  opening_float_cents: bigint;
  declared_closing_cash_cents: bigint | null;
  expected_closing_cash_cents: bigint | null;
  variance_cents: bigint | null;
  currency_code: string;
  notes: string | null;
  status: "open" | "closed";
}

interface PaymentAggRow {
  method: string;
  count: bigint | number;
  amount_cents: bigint | number;
}

interface TopProductRow {
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  units: bigint | number;
  revenue_cents: bigint | number;
}

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── helpers ──────────────────────────────────────────────────────────

  assertCanRead(role: string): void {
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Your role can't view shifts",
      });
    }
  }

  /**
   * Find the current cashier's open shift (any branch) — used by sales to
   * stamp `shift_id` on a new sale. Returns null when none is open.
   */
  async findCurrentForCashier(tenantId: string, cashierId: string): Promise<{ id: string; branch_id: string } | null> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.cashierShift.findFirst({
      where: { cashier_id: cashierId, status: "open", deleted_at: null },
      select: { id: true, branch_id: true },
      orderBy: { opened_at: "desc" },
    });
    return row;
  }

  // ─── reads ────────────────────────────────────────────────────────────

  async getCurrent(
    tenantId: string,
    userId: string,
  ): Promise<ApiCashierShift | null> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.cashierShift.findFirst({
      where: { cashier_id: userId, status: "open", deleted_at: null },
      orderBy: { opened_at: "desc" },
    });
    if (!row) return null;
    return this.toSummary(row, await this.fetchBranchAndCashierMeta(tenantId, [row]));
  }

  async list(
    tenantId: string,
    userId: string,
    role: string,
    q: ListShiftsQuery,
  ): Promise<{ items: ApiCashierShift[]; total: number; page: number; limit: number }> {
    this.assertCanRead(role);
    const scoped = tenantScoped(tenantId);

    const skip = (q.page - 1) * q.limit;
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.branch_id) where.branch_id = q.branch_id;
    if (q.status) where.status = q.status;
    // Cashiers only see their own shifts; managers/owners see all branch shifts.
    if (role === "cashier") where.cashier_id = userId;
    if (q.from || q.to) {
      where.opened_at = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      scoped.cashierShift.findMany({
        where,
        orderBy: [{ opened_at: "desc" }],
        skip,
        take: q.limit,
      }),
      scoped.cashierShift.count({ where }),
    ]);

    const meta = await this.fetchBranchAndCashierMeta(tenantId, rows);
    return {
      items: rows.map((r) => this.toSummary(r, meta)),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getDetail(
    tenantId: string,
    userId: string,
    role: string,
    shiftId: string,
  ): Promise<ApiShiftDetail> {
    this.assertCanRead(role);
    const scoped = tenantScoped(tenantId);
    const row = await scoped.cashierShift.findUnique({ where: { id: shiftId } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "shift_not_found", message: "Shift not found" });
    }
    if (role === "cashier" && row.cashier_id !== userId) {
      // Cashiers can only see their own shifts. Return 404 (no existence leak)
      // matching the existing convention in stock-transfers and branches.
      throw new NotFoundException({ code: "shift_not_found", message: "Shift not found" });
    }

    const meta = await this.fetchBranchAndCashierMeta(tenantId, [row]);
    const summary = this.toSummary(row, meta);

    const zReport = await this.buildZReport(tenantId, row);
    return { ...summary, z_report: zReport };
  }

  // ─── mutations ────────────────────────────────────────────────────────

  async open(
    tenantId: string,
    user: { userId: string; role: string; branchId?: string | null },
    body: OpenShiftBody,
    ctx: AuditCtx,
  ): Promise<ApiCashierShift> {
    if (!READ_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Your role can't open a shift",
      });
    }
    const scoped = tenantScoped(tenantId);

    // Cashiers can only open shifts at their assigned branch.
    if (user.role === "cashier" && user.branchId && user.branchId !== body.branch_id) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "You can only open a shift at your assigned branch",
      });
    }

    const branch = await scoped.branch.findUnique({ where: { id: body.branch_id } });
    if (!branch || branch.deleted_at || !branch.is_active) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "Branch not found",
      });
    }

    // Reject a second open shift for the same cashier — the partial unique
    // index would catch it too, but a friendlier error is worth the round-trip.
    const existingOpen = await scoped.cashierShift.findFirst({
      where: { cashier_id: user.userId, status: "open", deleted_at: null },
      select: { id: true, branch_id: true, opened_at: true },
    });
    if (existingOpen) {
      throw new ConflictException({
        code: "shift_already_open",
        message: "You already have an open shift — close it before opening another.",
        details: existingOpen,
      });
    }

    const created = await scoped.cashierShift.create({
      data: {
        tenant_id: tenantId,
        branch_id: body.branch_id,
        cashier_id: user.userId,
        opened_by: user.userId,
        opening_float_cents: body.opening_float_cents,
        currency_code: body.currency_code ?? branch.currency_code,
        status: "open",
      },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "shift_opened",
        entity: "cashier_shift",
        entityId: created.id,
        after: {
          branch_id: created.branch_id,
          opening_float_cents: created.opening_float_cents.toString(),
          currency_code: created.currency_code,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const meta = await this.fetchBranchAndCashierMeta(tenantId, [created]);
    return this.toSummary(created, meta);
  }

  async close(
    tenantId: string,
    user: { userId: string; role: string },
    shiftId: string,
    body: CloseShiftBody,
    ctx: AuditCtx,
  ): Promise<ApiShiftDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.cashierShift.findUnique({ where: { id: shiftId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "shift_not_found", message: "Shift not found" });
    }
    if (existing.status === "closed") {
      throw new ConflictException({
        code: "shift_already_closed",
        message: "This shift is already closed.",
      });
    }
    // Only the shift's own cashier OR an owner/manager can close it.
    if (
      existing.cashier_id !== user.userId &&
      user.role !== "owner" &&
      user.role !== "manager"
    ) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the shift's cashier, a manager, or the owner can close this shift.",
      });
    }

    // Expected cash = opening float + Σ(cash sale_payments) − Σ(cash sale_refund_payments).
    // Refunds are deducted because the cashier handed cash back during the shift.
    const [cashSales, cashRefunds] = await Promise.all([
      scoped.salePayment.aggregate({
        _sum: { amount_cents: true },
        where: {
          method: "cash",
          sale: { shift_id: shiftId, deleted_at: null },
        },
      }),
      scoped.saleRefundPayment.aggregate({
        _sum: { amount_cents: true },
        where: {
          method: "cash",
          refund: { shift_id: shiftId, deleted_at: null },
        },
      }),
    ]);
    const cashInCents = (cashSales._sum.amount_cents as bigint | null) ?? 0n;
    const cashOutCents = (cashRefunds._sum.amount_cents as bigint | null) ?? 0n;
    const expectedClosingCents =
      existing.opening_float_cents + cashInCents - cashOutCents;
    const variance = body.declared_closing_cash_cents - expectedClosingCents;

    const updated = await scoped.cashierShift.update({
      where: { id: shiftId },
      data: {
        status: "closed",
        closed_at: new Date(),
        closed_by: user.userId,
        declared_closing_cash_cents: body.declared_closing_cash_cents,
        expected_closing_cash_cents: expectedClosingCents,
        variance_cents: variance,
        notes: body.notes ?? null,
      },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "shift_closed",
        entity: "cashier_shift",
        entityId: shiftId,
        before: {
          opening_float_cents: existing.opening_float_cents.toString(),
        },
        after: {
          declared_closing_cash_cents: updated.declared_closing_cash_cents?.toString() ?? null,
          expected_closing_cash_cents: updated.expected_closing_cash_cents?.toString() ?? null,
          variance_cents: updated.variance_cents?.toString() ?? null,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const meta = await this.fetchBranchAndCashierMeta(tenantId, [updated]);
    const summary = this.toSummary(updated, meta);
    const zReport = await this.buildZReport(tenantId, updated);
    return { ...summary, z_report: zReport };
  }

  // ─── internals ────────────────────────────────────────────────────────

  private async fetchBranchAndCashierMeta(
    tenantId: string,
    rows: Array<{ branch_id: string; cashier_id: string }>,
  ): Promise<{
    branchById: Map<string, { code: string }>;
    cashierById: Map<string, { name: string }>;
  }> {
    const branchIds = Array.from(new Set(rows.map((r) => r.branch_id)));
    const cashierIds = Array.from(new Set(rows.map((r) => r.cashier_id)));
    const scoped = tenantScoped(tenantId);
    const [branches, cashiers] = await Promise.all([
      branchIds.length === 0
        ? []
        : scoped.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, code: true },
          }),
      cashierIds.length === 0
        ? []
        : scoped.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          }),
    ]);
    return {
      branchById: new Map(branches.map((b) => [b.id, { code: b.code }])),
      cashierById: new Map(cashiers.map((u) => [u.id, { name: u.name }])),
    };
  }

  private toSummary(
    row: RawShiftRow | Awaited<ReturnType<typeof tenantScoped>["cashierShift"]["findUnique"]>,
    meta: {
      branchById: Map<string, { code: string }>;
      cashierById: Map<string, { name: string }>;
    },
  ): ApiCashierShift {
    const r = row as RawShiftRow;
    return {
      id: r.id,
      branch_id: r.branch_id,
      branch_code: meta.branchById.get(r.branch_id)?.code ?? "",
      cashier_id: r.cashier_id,
      cashier_name: meta.cashierById.get(r.cashier_id)?.name ?? null,
      opened_at: r.opened_at.toISOString(),
      opened_by: r.opened_by,
      closed_at: r.closed_at?.toISOString() ?? null,
      closed_by: r.closed_by ?? null,
      opening_float_cents: r.opening_float_cents.toString(),
      declared_closing_cash_cents: r.declared_closing_cash_cents?.toString() ?? null,
      expected_closing_cash_cents: r.expected_closing_cash_cents?.toString() ?? null,
      variance_cents: r.variance_cents?.toString() ?? null,
      currency_code: r.currency_code,
      notes: r.notes,
      status: r.status,
    };
  }

  private async buildZReport(
    tenantId: string,
    shift: { id: string },
  ): Promise<ApiShiftDetail["z_report"]> {
    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
      sale: { aggregate: (args: unknown) => Promise<{ _sum: { total_cents: bigint | null }; _count: number }> };
      saleLine: { aggregate: (args: unknown) => Promise<{ _sum: { qty: number | null } }> };
    };

    // Aggregate totals over sales attached to this shift.
    const totals = await client.sale.aggregate({
      _sum: { total_cents: true },
      _count: true as unknown as boolean,
      where: { shift_id: shift.id, deleted_at: null },
    } as unknown);
    const items = await client.saleLine.aggregate({
      _sum: { qty: true },
      where: { sale: { shift_id: shift.id, deleted_at: null } },
    } as unknown);

    const paymentAgg = await client.$queryRawUnsafe<PaymentAggRow[]>(
      `SELECT sp.method::text AS method,
              COUNT(*)::bigint AS count,
              COALESCE(SUM(sp.amount_cents), 0)::bigint AS amount_cents
       FROM sale_payments sp
       INNER JOIN sales s ON s.id = sp.sale_id AND s.deleted_at IS NULL
       WHERE s.shift_id = $1::uuid
       GROUP BY sp.method
       ORDER BY amount_cents DESC`,
      shift.id,
    );

    const topProducts = await client.$queryRawUnsafe<TopProductRow[]>(
      `SELECT sl.product_id,
              p.sku,
              p.name_i18n,
              COALESCE(SUM(sl.qty), 0)::bigint AS units,
              COALESCE(SUM(sl.line_total_cents), 0)::bigint AS revenue_cents
       FROM sale_lines sl
       INNER JOIN sales s ON s.id = sl.sale_id AND s.deleted_at IS NULL
       INNER JOIN products p ON p.id = sl.product_id
       WHERE s.shift_id = $1::uuid
       GROUP BY sl.product_id, p.sku, p.name_i18n
       ORDER BY revenue_cents DESC
       LIMIT 5`,
      shift.id,
    );

    const cashRefundsAgg = await scoped.saleRefundPayment.aggregate({
      _sum: { amount_cents: true },
      where: {
        method: "cash",
        refund: { shift_id: shift.id, deleted_at: null },
      },
    });
    const cashRefundsCents =
      (cashRefundsAgg._sum.amount_cents as bigint | null) ?? 0n;

    const cashRow = paymentAgg.find((p) => p.method === "cash");
    return {
      transactions: Number(totals._count ?? 0),
      items_sold: Number(items._sum.qty ?? 0),
      gross_revenue_cents: (totals._sum.total_cents ?? 0n).toString(),
      cash_sales_cents: cashRow
        ? (typeof cashRow.amount_cents === "bigint"
            ? cashRow.amount_cents
            : BigInt(cashRow.amount_cents)
          ).toString()
        : "0",
      cash_refunds_cents: cashRefundsCents.toString(),
      by_payment: paymentAgg.map((p) => ({
        method: p.method,
        count: Number(p.count),
        amount_cents: (typeof p.amount_cents === "bigint"
          ? p.amount_cents
          : BigInt(p.amount_cents)
        ).toString(),
      })),
      top_products: topProducts.map((tp) => ({
        product_id: tp.product_id,
        sku: tp.sku,
        name_i18n: tp.name_i18n,
        units: Number(tp.units),
        revenue_cents: (typeof tp.revenue_cents === "bigint"
          ? tp.revenue_cents
          : BigInt(tp.revenue_cents)
        ).toString(),
      })),
    };
  }
}
