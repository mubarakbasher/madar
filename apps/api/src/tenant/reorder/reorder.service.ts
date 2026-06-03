import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import type { ReorderSuggestionsQuery } from "./dto/suggestions-query.dto";

interface I18n {
  en?: string;
  ar?: string;
}

export interface ReorderLine {
  product_id: string;
  sku: string;
  name_i18n: I18n | null;
  qty_on_hand: number;
  days_of_cover: number | null;
  velocity_per_day: number;
  suggested_qty: number;
  unit_cost_cents: string;
}

export interface ReorderGroup {
  supplier_id: string;
  supplier_code: string;
  supplier_name_i18n: I18n | null;
  lead_time_days: number | null;
  currency_code: string;
  lines: ReorderLine[];
  suggested_total_cents: string;
}

export interface ReorderSuggestions {
  branch_id: string;
  branch_code: string;
  branch_name_i18n: I18n | null;
  horizon_days: number;
  at_risk_count: number;
  groups: ReorderGroup[];
  ungrouped: ReorderLine[];
}

/** Raw row shape returned by the suggestions query. */
interface SuggestionRow {
  product_id: string;
  sku: string;
  name_i18n: unknown;
  qty_on_hand: number;
  days_of_cover: number | null;
  velocity: number;
  suggested_qty: number;
  unit_cost_cents: string;
  supplier_id: string | null;
  supplier_code: string | null;
  supplier_name_i18n: unknown;
  lead_time_days: number | null;
  supplier_currency: string | null;
}

const READ_ROLES = new Set(["owner", "manager"]);

function asI18n(value: unknown): I18n | null {
  if (value && typeof value === "object") return value as I18n;
  return null;
}

@Injectable()
export class ReorderService {
  /**
   * On-demand reorder suggestions for a single branch. Ranks SKUs that are
   * projected to run out within `horizon_days` (on-hand ÷ 30-day sales
   * velocity) OR have fallen to/below their reorder point, suggests an order
   * quantity, and groups them by preferred supplier so each group maps to one
   * draft purchase order. Read-only — no ledger writes, no audit.
   */
  async getSuggestions(
    actor: { tenantId: string; userId: string; role: string },
    q: ReorderSuggestionsQuery,
  ): Promise<ReorderSuggestions> {
    if (!READ_ROLES.has(actor.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can view reorder suggestions",
      });
    }

    const scoped = tenantScoped(actor.tenantId) as unknown as {
      branch: {
        findUnique: (args: {
          where: { id: string };
          select: { id: true; code: true; name_i18n: true; deleted_at: true };
        }) => Promise<{ id: string; code: string; name_i18n: unknown; deleted_at: Date | null } | null>;
      };
      user: {
        findUnique: (args: {
          where: { id: string };
          select: { branch_id: true };
        }) => Promise<{ branch_id: string | null } | null>;
      };
      $queryRawUnsafe: <T = unknown>(query: string, ...params: unknown[]) => Promise<T>;
    };

    const branch = await scoped.branch.findUnique({
      where: { id: q.branch_id },
      select: { id: true, code: true, name_i18n: true, deleted_at: true },
    });
    if (!branch || branch.deleted_at) {
      throw new NotFoundException({ code: "branch_not_found", message: "Branch not found" });
    }

    // Managers are scoped to their assigned branch; owners may query any branch.
    if (actor.role === "manager") {
      const me = await scoped.user.findUnique({
        where: { id: actor.userId },
        select: { branch_id: true },
      });
      if (!me?.branch_id || me.branch_id !== q.branch_id) {
        throw new ForbiddenException({
          code: "forbidden_branch",
          message: "Managers can only view reorder suggestions for their own branch",
        });
      }
    }

    const rows = await scoped.$queryRawUnsafe<SuggestionRow[]>(
      `
      WITH vel AS (
        SELECT product_id, SUM(ABS(qty_delta))::float8 / 30.0 AS velocity
        FROM stock_movements
        WHERE kind = 'sale'
          AND branch_id = $1::uuid
          AND occurred_at > now() - INTERVAL '30 days'
        GROUP BY product_id
      )
      SELECT
        p.id            AS product_id,
        p.sku           AS sku,
        p.name_i18n     AS name_i18n,
        bs.qty_on_hand  AS qty_on_hand,
        CASE WHEN COALESCE(v.velocity, 0) > 0
             THEN ROUND(bs.qty_on_hand / v.velocity)::int
             ELSE NULL END AS days_of_cover,
        COALESCE(v.velocity, 0)::float8 AS velocity,
        COALESCE(
          bs.reorder_qty,
          CASE WHEN COALESCE(v.velocity, 0) > 0
            THEN GREATEST(CEIL(v.velocity * (COALESCE(s.lead_time_days, 0) + $2::int)) - bs.qty_on_hand, 1)::int
            ELSE GREATEST(COALESCE(bs.reorder_point, 0) - bs.qty_on_hand, 1)::int
          END
        )::int AS suggested_qty,
        COALESCE(sp.unit_cost_cents, p.cost_cents)::text AS unit_cost_cents,
        s.id            AS supplier_id,
        s.code          AS supplier_code,
        s.name_i18n     AS supplier_name_i18n,
        s.lead_time_days AS lead_time_days,
        s.currency_code AS supplier_currency
      FROM branch_stock bs
      INNER JOIN products p
        ON p.id = bs.product_id AND p.deleted_at IS NULL AND p.is_active = true
      LEFT JOIN vel v ON v.product_id = bs.product_id
      LEFT JOIN supplier_products sp
        ON sp.product_id = bs.product_id AND sp.is_preferred = true AND sp.deleted_at IS NULL
      LEFT JOIN suppliers s
        ON s.id = sp.supplier_id AND s.deleted_at IS NULL AND s.is_active = true
      WHERE bs.branch_id = $1::uuid
        AND bs.deleted_at IS NULL
        AND (
          (COALESCE(v.velocity, 0) > 0 AND bs.qty_on_hand / v.velocity <= $2::int)
          OR (bs.reorder_point IS NOT NULL AND bs.qty_on_hand <= bs.reorder_point)
        )
      ORDER BY days_of_cover ASC NULLS LAST, bs.qty_on_hand ASC
      `,
      q.branch_id,
      q.horizon_days,
    );

    const toLine = (r: SuggestionRow): ReorderLine => ({
      product_id: r.product_id,
      sku: r.sku,
      name_i18n: asI18n(r.name_i18n),
      qty_on_hand: r.qty_on_hand,
      days_of_cover: r.days_of_cover,
      velocity_per_day: Math.round(Number(r.velocity) * 10) / 10,
      suggested_qty: r.suggested_qty,
      unit_cost_cents: r.unit_cost_cents,
    });

    const groupsById = new Map<string, ReorderGroup>();
    const ungrouped: ReorderLine[] = [];

    for (const r of rows) {
      const line = toLine(r);
      if (!r.supplier_id) {
        ungrouped.push(line);
        continue;
      }
      let group = groupsById.get(r.supplier_id);
      if (!group) {
        group = {
          supplier_id: r.supplier_id,
          supplier_code: r.supplier_code ?? "",
          supplier_name_i18n: asI18n(r.supplier_name_i18n),
          lead_time_days: r.lead_time_days,
          currency_code: r.supplier_currency ?? "",
          lines: [],
          suggested_total_cents: "0",
        };
        groupsById.set(r.supplier_id, group);
      }
      group.lines.push(line);
    }

    // Per-group suggested total (suggested_qty × unit cost), as a decimal string.
    const groups = Array.from(groupsById.values()).map((g) => {
      const total = g.lines.reduce(
        (sum, l) => sum + BigInt(l.suggested_qty) * BigInt(l.unit_cost_cents),
        0n,
      );
      return { ...g, suggested_total_cents: total.toString() };
    });

    return {
      branch_id: branch.id,
      branch_code: branch.code,
      branch_name_i18n: asI18n(branch.name_i18n),
      horizon_days: q.horizon_days,
      at_risk_count: rows.length,
      groups,
      ungrouped,
    };
  }
}
