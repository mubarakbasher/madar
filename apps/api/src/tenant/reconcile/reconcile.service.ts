import { ForbiddenException, Injectable } from "@nestjs/common";
import { tenantScoped } from "@madar/db";

const READ_ROLES = new Set(["owner", "manager", "accountant"]);

export interface ReconcileShift {
  id: string;
  cashier_id: string;
  cashier_name: string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_float_cents: string;
  declared_closing_cash_cents: string | null;
  expected_closing_cash_cents: string | null;
  variance_cents: string | null;
}

export interface ReconcilePaymentRow {
  method: string;
  count: number;
  amount_cents: string;
}

export interface ReconcileTotals {
  gross_revenue_cents: string;
  transactions: number;
  items_sold: number;
  cash_sales_cents: string;
  cash_refunds_cents: string;
  opening_float_cents: string;
  expected_cash_cents: string;
  declared_cash_cents: string;
  variance_cents: string;
  by_payment: ReconcilePaymentRow[];
}

export interface ReconcileBranch {
  branch_id: string;
  branch_code: string;
  name_i18n: { en: string; ar: string };
  shifts: ReconcileShift[];
  totals: ReconcileTotals;
}

export interface ReconcileDayResponse {
  date: string;
  branches: ReconcileBranch[];
  chain_totals: ReconcileTotals;
  // Chain totals are plain sums across branches — meaningless when branches
  // trade in different currencies (USD cents + KWD fils). Mirrors the PnL
  // report's warning flag so the UI can caveat the chain card.
  mixed_currency_warning: boolean;
}

@Injectable()
export class ReconcileService {
  async getDay(
    tenantId: string,
    role: string,
    opts: { date: string; branchId?: string },
  ): Promise<ReconcileDayResponse> {
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners, managers, and accountants can view reconciliation",
      });
    }
    const scoped = tenantScoped(tenantId);

    // Use the given date as a calendar day in branch-local timezone. For
    // simplicity v1 uses UTC start-of-day → next-day boundaries. Future slice
    // can per-branch-TZ this when multi-TZ tenants pull on it.
    const start = new Date(`${opts.date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);

    const branchWhere: Record<string, unknown> = { deleted_at: null };
    if (opts.branchId) branchWhere.id = opts.branchId;
    const branches = (await scoped.branch.findMany({
      where: branchWhere,
      select: { id: true, code: true, name_i18n: true, currency_code: true },
      orderBy: { code: "asc" },
    })) as Array<{ id: string; code: string; name_i18n: unknown; currency_code: string }>;

    const perBranch: ReconcileBranch[] = [];
    for (const b of branches) {
      const branchData = await this.collectBranch(scoped, b, start, end);
      perBranch.push(branchData);
    }

    const chainTotals = this.sumTotals(perBranch.map((b) => b.totals));
    const currencies = new Set(branches.map((b) => b.currency_code));

    return {
      date: opts.date,
      branches: perBranch,
      chain_totals: chainTotals,
      mixed_currency_warning: currencies.size > 1,
    };
  }

  private async collectBranch(
    scoped: ReturnType<typeof tenantScoped>,
    branch: { id: string; code: string; name_i18n: unknown },
    start: Date,
    end: Date,
  ): Promise<ReconcileBranch> {
    const client = scoped as unknown as {
      cashierShift: {
        findMany: (args: unknown) => Promise<RawShift[]>;
      };
      sale: {
        aggregate: (args: unknown) => Promise<{
          _sum: { total_cents: bigint | null };
          _count: number;
        }>;
      };
      saleLine: {
        aggregate: (args: unknown) => Promise<{ _sum: { qty: number | null } }>;
      };
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
      user: {
        findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
      };
    };

    const shiftRows = await client.cashierShift.findMany({
      where: {
        branch_id: branch.id,
        deleted_at: null,
        OR: [
          { opened_at: { gte: start, lt: end } },
          { closed_at: { gte: start, lt: end } },
        ],
      },
      orderBy: { opened_at: "asc" },
    });

    const cashierIds = Array.from(new Set(shiftRows.map((s) => s.cashier_id)));
    const cashiers =
      cashierIds.length === 0
        ? []
        : await client.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          });
    const cashierById = new Map(cashiers.map((u) => [u.id, u.name]));

    const shifts: ReconcileShift[] = shiftRows.map((r) => ({
      id: r.id,
      cashier_id: r.cashier_id,
      cashier_name: cashierById.get(r.cashier_id) ?? null,
      opened_at: r.opened_at.toISOString(),
      closed_at: r.closed_at?.toISOString() ?? null,
      status: r.status,
      opening_float_cents: r.opening_float_cents.toString(),
      declared_closing_cash_cents:
        r.declared_closing_cash_cents?.toString() ?? null,
      expected_closing_cash_cents:
        r.expected_closing_cash_cents?.toString() ?? null,
      variance_cents: r.variance_cents?.toString() ?? null,
    }));

    // Sale totals + line count for the branch×day window.
    const [saleAgg, lineAgg, payments, refundPayments] = await Promise.all([
      client.sale.aggregate({
        _sum: { total_cents: true },
        _count: true as unknown as boolean,
        where: {
          branch_id: branch.id,
          deleted_at: null,
          occurred_at: { gte: start, lt: end },
          payment_status: { in: ["paid", "payment_pending"] },
        },
      }),
      client.saleLine.aggregate({
        _sum: { qty: true },
        where: {
          sale: {
            branch_id: branch.id,
            deleted_at: null,
            occurred_at: { gte: start, lt: end },
            payment_status: { in: ["paid", "payment_pending"] },
          },
        },
      }),
      client.$queryRawUnsafe<PaymentAggRow[]>(
        `SELECT sp.method::text AS method,
                COUNT(*)::bigint AS count,
                COALESCE(SUM(sp.amount_cents), 0)::bigint AS amount_cents
         FROM sale_payments sp
         INNER JOIN sales s ON s.id = sp.sale_id
           AND s.deleted_at IS NULL
           AND s.branch_id = $1::uuid
           AND s.occurred_at >= $2::timestamptz
           AND s.occurred_at < $3::timestamptz
         GROUP BY sp.method
         ORDER BY amount_cents DESC`,
        branch.id,
        start.toISOString(),
        end.toISOString(),
      ),
      client.$queryRawUnsafe<{ amount_cents: bigint | number }[]>(
        `SELECT COALESCE(SUM(srp.amount_cents), 0)::bigint AS amount_cents
         FROM sale_refund_payments srp
         INNER JOIN sale_refunds sr ON sr.id = srp.refund_id
           AND sr.deleted_at IS NULL
           AND sr.branch_id = $1::uuid
           AND sr.occurred_at >= $2::timestamptz
           AND sr.occurred_at < $3::timestamptz
         WHERE srp.method = 'cash'`,
        branch.id,
        start.toISOString(),
        end.toISOString(),
      ),
    ]);

    const cashRow = payments.find((p) => p.method === "cash");
    const cashSales = cashRow
      ? typeof cashRow.amount_cents === "bigint"
        ? cashRow.amount_cents
        : BigInt(cashRow.amount_cents)
      : 0n;

    const cashRefundsRaw = refundPayments[0]?.amount_cents ?? 0n;
    const cashRefunds =
      typeof cashRefundsRaw === "bigint" ? cashRefundsRaw : BigInt(cashRefundsRaw);

    // Aggregate opening_float across all the branch's shifts for the day.
    const openingFloat = shiftRows.reduce(
      (sum, s) => sum + s.opening_float_cents,
      0n,
    );
    const expectedCash = openingFloat + cashSales - cashRefunds;
    const declaredCash = shiftRows.reduce(
      (sum, s) => sum + (s.declared_closing_cash_cents ?? 0n),
      0n,
    );
    const variance = declaredCash - expectedCash;

    const totals: ReconcileTotals = {
      gross_revenue_cents: (saleAgg._sum.total_cents ?? 0n).toString(),
      transactions: Number(saleAgg._count ?? 0),
      items_sold: Number(lineAgg._sum.qty ?? 0),
      cash_sales_cents: cashSales.toString(),
      cash_refunds_cents: cashRefunds.toString(),
      opening_float_cents: openingFloat.toString(),
      expected_cash_cents: expectedCash.toString(),
      declared_cash_cents: declaredCash.toString(),
      variance_cents: variance.toString(),
      by_payment: payments.map((p) => ({
        method: p.method,
        count: Number(p.count),
        amount_cents: (typeof p.amount_cents === "bigint"
          ? p.amount_cents
          : BigInt(p.amount_cents)
        ).toString(),
      })),
    };

    return {
      branch_id: branch.id,
      branch_code: branch.code,
      name_i18n: (branch.name_i18n as { en: string; ar: string }) ?? {
        en: branch.code,
        ar: branch.code,
      },
      shifts,
      totals,
    };
  }

  private sumTotals(rows: ReconcileTotals[]): ReconcileTotals {
    const out: ReconcileTotals = {
      gross_revenue_cents: "0",
      transactions: 0,
      items_sold: 0,
      cash_sales_cents: "0",
      cash_refunds_cents: "0",
      opening_float_cents: "0",
      expected_cash_cents: "0",
      declared_cash_cents: "0",
      variance_cents: "0",
      by_payment: [],
    };

    const byMethod = new Map<string, { count: number; amount: bigint }>();
    let gross = 0n;
    let cashSales = 0n;
    let cashRefunds = 0n;
    let openingFloat = 0n;
    let expectedCash = 0n;
    let declaredCash = 0n;
    let variance = 0n;
    for (const r of rows) {
      out.transactions += r.transactions;
      out.items_sold += r.items_sold;
      gross += BigInt(r.gross_revenue_cents);
      cashSales += BigInt(r.cash_sales_cents);
      cashRefunds += BigInt(r.cash_refunds_cents);
      openingFloat += BigInt(r.opening_float_cents);
      expectedCash += BigInt(r.expected_cash_cents);
      declaredCash += BigInt(r.declared_cash_cents);
      variance += BigInt(r.variance_cents);
      for (const p of r.by_payment) {
        const existing = byMethod.get(p.method) ?? { count: 0, amount: 0n };
        existing.count += p.count;
        existing.amount += BigInt(p.amount_cents);
        byMethod.set(p.method, existing);
      }
    }
    out.gross_revenue_cents = gross.toString();
    out.cash_sales_cents = cashSales.toString();
    out.cash_refunds_cents = cashRefunds.toString();
    out.opening_float_cents = openingFloat.toString();
    out.expected_cash_cents = expectedCash.toString();
    out.declared_cash_cents = declaredCash.toString();
    out.variance_cents = variance.toString();
    out.by_payment = Array.from(byMethod.entries())
      .map(([method, v]) => ({
        method,
        count: v.count,
        amount_cents: v.amount.toString(),
      }))
      .sort((a, b) =>
        BigInt(b.amount_cents) > BigInt(a.amount_cents) ? 1 : -1,
      );
    return out;
  }
}

interface RawShift {
  id: string;
  cashier_id: string;
  opened_at: Date;
  closed_at: Date | null;
  status: string;
  opening_float_cents: bigint;
  declared_closing_cash_cents: bigint | null;
  expected_closing_cash_cents: bigint | null;
  variance_cents: bigint | null;
}

interface PaymentAggRow {
  method: string;
  count: bigint | number;
  amount_cents: bigint | number;
}
