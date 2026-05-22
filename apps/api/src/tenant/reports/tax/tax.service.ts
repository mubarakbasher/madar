import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
// tenants.tax_registration_number + default_tax_class_id are platform-scoped
// columns, read via adminPrisma. Mirrors the dashboard/tax-classes pattern.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import type { TaxQuery } from "./dto/tax.dto";

const READER_ROLES = new Set(["owner", "manager", "accountant", "auditor"]);

export interface ApiTaxReportItem {
  tax_class_id: string | null;
  tax_class_code: string | null;
  tax_class_name_i18n: { en: string; ar: string } | null;
  rate_bps: number;
  taxable_sales_cents: string;
  tax_collected_cents: string;
  transactions: number;
}

export interface ApiTaxReport {
  currency: string;
  from: string;
  to: string;
  tax_registration_number: string | null;
  items: ApiTaxReportItem[];
  totals: {
    taxable_sales_cents: string;
    tax_collected_cents: string;
    transactions: number;
  };
}

interface TaxAggRow {
  tax_class_id: string | null;
  tax_class_code: string | null;
  tax_class_name_i18n: unknown;
  rate_bps: number | null;
  taxable_sales_cents: bigint | number | null;
  tax_collected_cents: bigint | number | null;
  transactions: bigint | number | null;
}

@Injectable()
export class TaxReportService {
  private readonly logger = new Logger(TaxReportService.name);

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to view the tax report",
      });
    }
  }

  async getTenantName(tenantId: string): Promise<string> {
    const t = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return t?.name ?? "—";
  }

  async getReport(tenantId: string, q: TaxQuery): Promise<ApiTaxReport> {
    // tenants is a platform table — admin-scoped lookup for tax-registration
    // number + default_tax_class_id (the latter drives fall-through grouping).
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        tax_registration_number: true,
        default_tax_class_id: true,
      },
    });
    const defaultTaxClassId = tenant?.default_tax_class_id ?? null;
    const taxRegNumber = tenant?.tax_registration_number ?? null;

    const scoped = tenantScoped(tenantId);
    const client = scoped as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
    };

    // [from, to+1day) — inclusive on both ends at midnight UTC; matches how
    // the dashboard treats date filters.
    const branchFilter = q.branch_id ? `AND s.branch_id = $5::uuid` : "";
    const params: unknown[] = [tenantId, q.currency, q.from, q.to];
    if (q.branch_id) params.push(q.branch_id);
    if (defaultTaxClassId) params.push(defaultTaxClassId);
    else params.push(null);
    // Note: defaultTaxClassId param index is $5 when branch_id absent, $6 when present.
    const defaultIdx = q.branch_id ? "$6" : "$5";

    const rows = await client.$queryRawUnsafe<TaxAggRow[]>(
      `WITH effective AS (
         SELECT
           COALESCE(p.tax_class_id, ${defaultIdx}::uuid) AS tax_class_id,
           sl.line_total_cents,
           COALESCE(sl.tax_cents, 0)::bigint AS tax_cents,
           s.id AS sale_id
         FROM sale_lines sl
         INNER JOIN sales s ON s.id = sl.sale_id
         INNER JOIN products p ON p.id = sl.product_id
         WHERE s.tenant_id = $1::uuid
           AND s.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND s.payment_status IN ('paid', 'payment_pending')
           AND s.currency_code = $2
           AND s.occurred_at >= $3::date
           AND s.occurred_at <  ($4::date + interval '1 day')
           ${branchFilter}
       )
       SELECT
         eff.tax_class_id,
         tc.code AS tax_class_code,
         tc.name_i18n AS tax_class_name_i18n,
         COALESCE(tc.rate_bps, 0)::int AS rate_bps,
         COALESCE(SUM(eff.line_total_cents), 0)::bigint AS taxable_sales_cents,
         COALESCE(SUM(eff.tax_cents), 0)::bigint AS tax_collected_cents,
         COUNT(DISTINCT eff.sale_id)::bigint AS transactions
       FROM effective eff
       LEFT JOIN tax_classes tc
         ON tc.id = eff.tax_class_id AND tc.deleted_at IS NULL
       GROUP BY eff.tax_class_id, tc.code, tc.name_i18n, tc.rate_bps
       ORDER BY tc.rate_bps DESC NULLS LAST, tc.code ASC NULLS LAST`,
      ...params,
    );

    const items: ApiTaxReportItem[] = rows.map((r) => ({
      tax_class_id: r.tax_class_id,
      tax_class_code: r.tax_class_code,
      tax_class_name_i18n:
        (r.tax_class_name_i18n as { en: string; ar: string } | null) ?? null,
      rate_bps: Number(r.rate_bps ?? 0),
      taxable_sales_cents: toBigStr(r.taxable_sales_cents),
      tax_collected_cents: toBigStr(r.tax_collected_cents),
      transactions: toNum(r.transactions),
    }));

    const totals = items.reduce(
      (acc, it) => {
        acc.taxable += BigInt(it.taxable_sales_cents);
        acc.tax += BigInt(it.tax_collected_cents);
        acc.tx += it.transactions;
        return acc;
      },
      { taxable: 0n, tax: 0n, tx: 0 },
    );

    return {
      currency: q.currency,
      from: q.from,
      to: q.to,
      tax_registration_number: taxRegNumber,
      items,
      totals: {
        taxable_sales_cents: totals.taxable.toString(),
        tax_collected_cents: totals.tax.toString(),
        // Note: `transactions` summed here may overcount when one sale spans
        // multiple tax classes (it's distinct-per-class). The totals row uses
        // sum-of-items, matching the per-row CSV/PDF semantics rather than
        // raw distinct-sale count chain-wide.
        transactions: totals.tx,
      },
    };
  }
}

function toBigStr(v: bigint | number | null | undefined): string {
  if (v == null) return "0";
  return typeof v === "bigint" ? v.toString() : String(v);
}
function toNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}
