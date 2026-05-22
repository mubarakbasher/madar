import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
// Supplier flows resolve tenant.default_currency_code from the platform-scoped
// `tenants` table when callers omit `currency_code` on create. Tenants is not
// under RLS, so the read goes through adminPrisma — same pattern as branches.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import { TenantStorageService } from "../../common/tenant-storage.service";
import type { ListSuppliersQuery } from "./dto/list-suppliers.dto";
import type { CreateSupplierBody } from "./dto/create-supplier.dto";
import type { UpdateSupplierBody } from "./dto/update-supplier.dto";
import type { CatalogCreateBody } from "./dto/catalog-create.dto";
import type { CatalogUpdateBody } from "./dto/catalog-update.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);
const OWNER_ONLY = new Set(["owner"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

export type SupplierDocumentKind = "contract" | "tax_certificate" | "bank_letter" | "other";

export interface ApiSupplierSummary {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  country_code: string | null;
  currency_code: string;
  lead_time_days: number | null;
  payment_terms: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  open_pos_count: number;
  owed_cents: string;
  last_order_at: string | null;
}

export interface ApiSupplierStats {
  fill_rate_pct: number | null;
  on_time_pct: number | null;
  avg_lead_time_days: number | null;
  total_orders: number;
  total_spend_cents: string;
}

export interface ApiSupplierActivity {
  kind: "po" | "audit";
  id: string;
  occurred_at: string;
  // PO fields (kind='po')
  code?: string | null;
  status?: string | null;
  total_cents?: string | null;
  // Audit fields (kind='audit')
  action?: string | null;
  actor_id?: string | null;
}

export interface ApiSupplierDetail {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  country_code: string | null;
  currency_code: string;
  lead_time_days: number | null;
  payment_terms: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_i18n: { en?: string; ar?: string } | null;
  tax_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stats: ApiSupplierStats;
  recent_activity: ApiSupplierActivity[];
}

export interface ApiSupplierCatalogRow {
  id: string;
  product_id: string;
  product_sku: string;
  product_name_i18n: { en: string; ar: string };
  supplier_sku: string | null;
  unit_cost_cents: string;
  currency_code: string;
  is_preferred: boolean;
  effective_from: string | null;
}

export interface ApiSupplierDocument {
  id: string;
  kind: SupplierDocumentKind;
  file_path: string;
  signed_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  download_url: string;
}

interface RawSupplierAggRow {
  supplier_id: string;
  open_pos_count: bigint | number;
  owed_cents: bigint | number;
  last_order_at: Date | null;
}

interface RawSupplierStatsRow {
  fill_rate_pct: number | string | null;
  on_time_pct: number | string | null;
  avg_lead_time_days: number | string | null;
  total_orders: bigint | number;
  total_spend_cents: bigint | number;
}

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly tenantStorage: TenantStorageService,
  ) {}

  // ─── role gates ────────────────────────────────────────────────────

  assertCanWrite(role: string): void {
    if (!OWNER_ONLY.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can perform this action",
      });
    }
  }

  assertCanMutate(role: string): void {
    if (!MUTATOR_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers may modify supplier data",
      });
    }
  }

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read supplier data",
      });
    }
  }

  // ─── core loader ───────────────────────────────────────────────────

  async loadSupplierOr404(tenantId: string, id: string) {
    const row = await tenantScoped(tenantId).supplier.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "supplier_not_found", message: "Supplier not found" });
    }
    return row;
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListSuppliersQuery,
  ): Promise<{ items: ApiSupplierSummary[]; total: number; page: number; limit: number }> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(query: string, ...params: unknown[]) => Promise<T>;
    };
    const skip = (q.page - 1) * q.limit;

    // Build WHERE clause params positionally.
    const params: unknown[] = [tenantId];
    let nextParam = 2;
    let searchClause = "";
    if (q.search) {
      searchClause = ` AND (
        s.code ILIKE $${nextParam}
        OR s.name_i18n->>'en' ILIKE $${nextParam}
        OR s.name_i18n->>'ar' ILIKE $${nextParam}
      )`;
      params.push(`%${q.search}%`);
      nextParam++;
    }
    const activeClause = q.active_only === true ? ` AND s.is_active = true` : "";

    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string;
        code: string;
        name_i18n: unknown;
        country_code: string | null;
        currency_code: string;
        lead_time_days: number | null;
        payment_terms: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        is_active: boolean;
        created_at: Date;
        open_pos_count: bigint | number | null;
        owed_cents: bigint | number | null;
        last_order_at: Date | null;
      }>
    >(
      `SELECT s.id,
              s.code,
              s.name_i18n,
              s.country_code,
              s.currency_code,
              s.lead_time_days,
              s.payment_terms,
              s.contact_email,
              s.contact_phone,
              s.is_active,
              s.created_at,
              COALESCE(agg.open_pos_count, 0)::bigint AS open_pos_count,
              COALESCE(agg.owed_cents, 0)::bigint AS owed_cents,
              agg.last_order_at
       FROM suppliers s
       LEFT JOIN (
         SELECT po.supplier_id,
                COUNT(*) FILTER (
                  WHERE po.status IN ('draft', 'ordered') AND po.deleted_at IS NULL
                )::bigint AS open_pos_count,
                COALESCE(SUM(po.total_cents) FILTER (
                  WHERE po.status = 'ordered' AND po.deleted_at IS NULL
                ), 0)::bigint AS owed_cents,
                MAX(po.created_at) FILTER (WHERE po.deleted_at IS NULL) AS last_order_at
         FROM purchase_orders po
         WHERE po.tenant_id = $1::uuid
         GROUP BY po.supplier_id
       ) agg ON agg.supplier_id = s.id
       WHERE s.tenant_id = $1::uuid
         AND s.deleted_at IS NULL
         ${activeClause}
         ${searchClause}
       ORDER BY s.code ASC
       LIMIT ${q.limit} OFFSET ${skip}`,
      ...params,
    );

    const totalRows = await client.$queryRawUnsafe<Array<{ total: bigint | number }>>(
      `SELECT COUNT(*)::bigint AS total
       FROM suppliers s
       WHERE s.tenant_id = $1::uuid
         AND s.deleted_at IS NULL
         ${activeClause}
         ${searchClause}`,
      ...params,
    );
    const total = totalRows[0]
      ? typeof totalRows[0].total === "bigint"
        ? Number(totalRows[0].total)
        : Number(totalRows[0].total)
      : 0;

    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name_i18n: r.name_i18n as { en: string; ar: string },
        country_code: r.country_code,
        currency_code: r.currency_code,
        lead_time_days: r.lead_time_days,
        payment_terms: r.payment_terms,
        contact_email: r.contact_email,
        contact_phone: r.contact_phone,
        is_active: r.is_active,
        created_at: r.created_at.toISOString(),
        open_pos_count: numberFrom(r.open_pos_count),
        owed_cents: bigintToString(r.owed_cents),
        last_order_at: r.last_order_at ? r.last_order_at.toISOString() : null,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiSupplierDetail> {
    const row = await this.loadSupplierOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);

    const [stats, recentPos, recentAudit] = await Promise.all([
      this.computeSupplierStats(tenantId, id),
      scoped.purchaseOrder.findMany({
        where: { supplier_id: id, deleted_at: null },
        orderBy: { created_at: "desc" },
        take: 5,
        select: { id: true, code: true, status: true, total_cents: true, created_at: true },
      }),
      scoped.auditLog.findMany({
        where: { entity: "supplier", entity_id: id },
        orderBy: { created_at: "desc" },
        take: 10,
        select: { id: true, action: true, user_id: true, created_at: true },
      }),
    ]);

    const activity: ApiSupplierActivity[] = [
      ...recentPos.map<ApiSupplierActivity>((po) => ({
        kind: "po",
        id: po.id,
        occurred_at: po.created_at.toISOString(),
        code: po.code,
        status: po.status,
        total_cents: po.total_cents.toString(),
      })),
      ...recentAudit.map<ApiSupplierActivity>((a) => ({
        kind: "audit",
        id: a.id,
        occurred_at: a.created_at.toISOString(),
        action: a.action,
        actor_id: a.user_id,
      })),
    ]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
      .slice(0, 10);

    return {
      id: row.id,
      code: row.code,
      name_i18n: row.name_i18n as { en: string; ar: string },
      country_code: row.country_code,
      currency_code: row.currency_code,
      lead_time_days: row.lead_time_days,
      payment_terms: row.payment_terms,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      address_i18n: (row.address_i18n as { en?: string; ar?: string } | null) ?? null,
      tax_id: row.tax_id,
      notes: row.notes,
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      stats,
      recent_activity: activity,
    };
  }

  async computeSupplierStats(tenantId: string, supplierId: string): Promise<ApiSupplierStats> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(q: string, ...p: unknown[]) => Promise<T>;
    };
    const rows = await client.$queryRawUnsafe<RawSupplierStatsRow[]>(
      `WITH po_received AS (
         SELECT po.id, po.expected_at, po.received_at, po.created_at, po.total_cents
         FROM purchase_orders po
         WHERE po.tenant_id = $1::uuid
           AND po.supplier_id = $2::uuid
           AND po.status = 'received'
           AND po.deleted_at IS NULL
       ),
       line_stats AS (
         SELECT COALESCE(SUM(pol.qty_ordered), 0)::bigint AS qty_ordered,
                COALESCE(SUM(pol.qty_received), 0)::bigint AS qty_received
         FROM purchase_order_lines pol
         INNER JOIN po_received pr ON pr.id = pol.po_id
         WHERE pol.tenant_id = $1::uuid
           AND pol.deleted_at IS NULL
       ),
       counts AS (
         SELECT
           COUNT(*) FILTER (WHERE expected_at IS NOT NULL AND received_at IS NOT NULL) AS on_time_total,
           COUNT(*) FILTER (
             WHERE expected_at IS NOT NULL
               AND received_at IS NOT NULL
               AND received_at::date <= expected_at
           ) AS on_time_hits,
           AVG(EXTRACT(EPOCH FROM (received_at - created_at)) / 86400.0)
             FILTER (WHERE received_at IS NOT NULL) AS avg_lead,
           COALESCE(SUM(total_cents), 0)::bigint AS spend_cents
         FROM po_received
       ),
       totals AS (
         SELECT COUNT(*)::bigint AS total_orders
         FROM purchase_orders po
         WHERE po.tenant_id = $1::uuid
           AND po.supplier_id = $2::uuid
           AND po.status <> 'cancelled'
           AND po.deleted_at IS NULL
       )
       SELECT
         CASE WHEN (SELECT qty_ordered FROM line_stats) > 0
           THEN ROUND(
             100.0 * (SELECT qty_received FROM line_stats)::numeric
             / NULLIF((SELECT qty_ordered FROM line_stats), 0)::numeric, 2)
           ELSE NULL
         END AS fill_rate_pct,
         CASE WHEN (SELECT on_time_total FROM counts) > 0
           THEN ROUND(
             100.0 * (SELECT on_time_hits FROM counts)::numeric
             / NULLIF((SELECT on_time_total FROM counts), 0)::numeric, 2)
           ELSE NULL
         END AS on_time_pct,
         (SELECT ROUND(avg_lead::numeric, 2) FROM counts) AS avg_lead_time_days,
         (SELECT total_orders FROM totals) AS total_orders,
         (SELECT spend_cents FROM counts) AS total_spend_cents`,
      tenantId,
      supplierId,
    );
    const r = rows[0];
    if (!r) {
      return {
        fill_rate_pct: null,
        on_time_pct: null,
        avg_lead_time_days: null,
        total_orders: 0,
        total_spend_cents: "0",
      };
    }
    return {
      fill_rate_pct: r.fill_rate_pct === null ? null : Number(r.fill_rate_pct),
      on_time_pct: r.on_time_pct === null ? null : Number(r.on_time_pct),
      avg_lead_time_days: r.avg_lead_time_days === null ? null : Number(r.avg_lead_time_days),
      total_orders: numberFrom(r.total_orders),
      total_spend_cents: bigintToString(r.total_spend_cents),
    };
  }

  // ─── supplier mutations ────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateSupplierBody,
    ctx: AuditCtx,
  ): Promise<ApiSupplierDetail> {
    const scoped = tenantScoped(tenantId);

    // Resolve default currency from the platform-scoped tenants table when caller omits.
    let currencyCode = body.currency_code;
    if (!currencyCode) {
      const tenant = await adminPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { default_currency_code: true },
      });
      if (!tenant) {
        throw new UnprocessableEntityException({
          code: "tenant_not_found",
          message: "Tenant not found",
        });
      }
      currencyCode = tenant.default_currency_code;
    }

    let created;
    try {
      created = await scoped.supplier.create({
        data: {
          tenant_id: tenantId,
          code: body.code,
          name_i18n: body.name_i18n,
          country_code: body.country_code ?? null,
          currency_code: currencyCode,
          lead_time_days: body.lead_time_days ?? null,
          payment_terms: body.payment_terms ?? null,
          contact_email: body.contact_email ?? null,
          contact_phone: body.contact_phone ?? null,
          address_i18n: body.address_i18n ?? undefined,
          tax_id: body.tax_id ?? null,
          notes: body.notes ?? null,
          is_active: body.is_active ?? true,
          created_by: actorId,
        },
      });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "code_taken",
          message: "A supplier with this code already exists",
          fields: { code: "code_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_created",
        entity: "supplier",
        entityId: created.id,
        after: {
          code: created.code,
          name_i18n_en: (created.name_i18n as { en?: string })?.en ?? null,
          currency_code: created.currency_code,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, created.id);
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateSupplierBody,
    ctx: AuditCtx,
  ): Promise<ApiSupplierDetail> {
    const existing = await this.loadSupplierOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    const track = (
      key: keyof typeof body,
      column: string,
      existingValue: unknown,
      transform: (v: unknown) => unknown = (v) => v,
    ) => {
      if (body[key] === undefined) return;
      const newValue = transform(body[key]);
      if (existingValue !== newValue) {
        data[column] = newValue;
        before[column] = existingValue;
        after[column] = newValue;
      }
    };

    track("name_i18n", "name_i18n", existing.name_i18n);
    track("country_code", "country_code", existing.country_code);
    track("currency_code", "currency_code", existing.currency_code);
    track("lead_time_days", "lead_time_days", existing.lead_time_days);
    track("payment_terms", "payment_terms", existing.payment_terms);
    track("contact_email", "contact_email", existing.contact_email);
    track("contact_phone", "contact_phone", existing.contact_phone);
    track("address_i18n", "address_i18n", existing.address_i18n);
    track("tax_id", "tax_id", existing.tax_id);
    track("notes", "notes", existing.notes);
    track("is_active", "is_active", existing.is_active);

    if (Object.keys(data).length > 0) {
      try {
        await scoped.supplier.update({ where: { id }, data });
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === "P2002") {
          throw new ConflictException({
            code: "code_taken",
            message: "A supplier with this code already exists",
          });
        }
        throw err;
      }
    }

    if (Object.keys(after).length > 0) {
      await this.audit
        .writeTenantScoped(ctx, {
          action: "supplier_updated",
          entity: "supplier",
          entityId: id,
          before,
          after,
        })
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    return this.getOne(tenantId, id);
  }

  async softDelete(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: "supplier_not_found", message: "Supplier not found" });
    }
    if (existing.deleted_at) {
      return { id: existing.id, deleted_at: existing.deleted_at.toISOString() };
    }

    const openPos = await scoped.purchaseOrder.count({
      where: {
        supplier_id: id,
        deleted_at: null,
        status: { in: ["draft", "ordered"] },
      },
    });
    if (openPos > 0) {
      throw new ConflictException({
        code: "supplier_has_open_pos",
        message: `Cannot delete supplier: ${openPos} open purchase order(s) reference this supplier`,
        fields: { open_pos: openPos.toString() },
      });
    }

    const now = new Date();
    await scoped.supplier.update({
      where: { id },
      data: { deleted_at: now, is_active: false },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_deleted",
        entity: "supplier",
        entityId: id,
        before: { code: existing.code, name_en: (existing.name_i18n as { en?: string })?.en ?? null },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id, deleted_at: now.toISOString() };
  }

  // ─── catalog ───────────────────────────────────────────────────────

  async listCatalog(tenantId: string, supplierId: string): Promise<ApiSupplierCatalogRow[]> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const rows = await scoped.supplierProduct.findMany({
      where: { supplier_id: supplierId, deleted_at: null },
      orderBy: { created_at: "desc" },
    });
    if (rows.length === 0) return [];

    const products = await scoped.product.findMany({
      where: { id: { in: rows.map((r) => r.product_id) } },
      select: { id: true, sku: true, name_i18n: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows.map((r) => {
      const p = byId.get(r.product_id);
      return {
        id: r.id,
        product_id: r.product_id,
        product_sku: p?.sku ?? "",
        product_name_i18n: (p?.name_i18n as { en: string; ar: string }) ?? { en: "", ar: "" },
        supplier_sku: r.supplier_sku,
        unit_cost_cents: r.unit_cost_cents.toString(),
        currency_code: r.currency_code,
        is_preferred: r.is_preferred,
        effective_from: r.effective_from
          ? r.effective_from.toISOString().slice(0, 10)
          : null,
      };
    });
  }

  async addCatalogEntry(
    tenantId: string,
    supplierId: string,
    actorId: string,
    body: CatalogCreateBody,
    ctx: AuditCtx,
  ): Promise<ApiSupplierCatalogRow> {
    const supplier = await this.loadSupplierOr404(tenantId, supplierId);
    await this.assertProductExists(tenantId, body.product_id);

    const scoped = tenantScoped(tenantId);
    const currencyCode = body.currency_code ?? supplier.currency_code;
    const isPreferred = body.is_preferred ?? false;

    const created = await scoped.$transaction(async (tx) => {
      // Transactional unset-then-insert: when a new row is preferred, flip
      // any other preferred entries for the same product to false first.
      if (isPreferred) {
        await tx.supplierProduct.updateMany({
          where: {
            tenant_id: tenantId,
            product_id: body.product_id,
            is_preferred: true,
            deleted_at: null,
          },
          data: { is_preferred: false },
        });
      }

      try {
        return await tx.supplierProduct.create({
          data: {
            tenant_id: tenantId,
            supplier_id: supplierId,
            product_id: body.product_id,
            supplier_sku: body.supplier_sku ?? null,
            unit_cost_cents: BigInt(body.unit_cost_cents),
            currency_code: currencyCode,
            is_preferred: isPreferred,
            effective_from: body.effective_from ? new Date(body.effective_from) : null,
            created_by: actorId,
          },
        });
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === "P2002") {
          throw new ConflictException({
            code: "supplier_product_exists",
            message: "This supplier already lists this product",
          });
        }
        throw err;
      }
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_product_added",
        entity: "supplier_product",
        entityId: created.id,
        after: {
          supplier_id: supplierId,
          product_id: body.product_id,
          is_preferred: isPreferred,
          unit_cost_cents: body.unit_cost_cents.toString(),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const product = await scoped.product.findUnique({
      where: { id: created.product_id },
      select: { sku: true, name_i18n: true },
    });

    return {
      id: created.id,
      product_id: created.product_id,
      product_sku: product?.sku ?? "",
      product_name_i18n: (product?.name_i18n as { en: string; ar: string }) ?? { en: "", ar: "" },
      supplier_sku: created.supplier_sku,
      unit_cost_cents: created.unit_cost_cents.toString(),
      currency_code: created.currency_code,
      is_preferred: created.is_preferred,
      effective_from: created.effective_from
        ? created.effective_from.toISOString().slice(0, 10)
        : null,
    };
  }

  async updateCatalogEntry(
    tenantId: string,
    supplierId: string,
    productId: string,
    body: CatalogUpdateBody,
    ctx: AuditCtx,
  ): Promise<ApiSupplierCatalogRow> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.supplierProduct.findFirst({
      where: { supplier_id: supplierId, product_id: productId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: "supplier_product_not_found",
        message: "This supplier does not list that product",
      });
    }

    const updated = await scoped.$transaction(async (tx) => {
      // Transactional unset of other preferred rows for the same product.
      if (body.is_preferred === true) {
        await tx.supplierProduct.updateMany({
          where: {
            tenant_id: tenantId,
            product_id: productId,
            is_preferred: true,
            deleted_at: null,
            NOT: { id: existing.id },
          },
          data: { is_preferred: false },
        });
      }

      const data: Record<string, unknown> = {};
      if (body.supplier_sku !== undefined) data.supplier_sku = body.supplier_sku;
      if (body.unit_cost_cents !== undefined) data.unit_cost_cents = BigInt(body.unit_cost_cents);
      if (body.currency_code !== undefined) data.currency_code = body.currency_code;
      if (body.is_preferred !== undefined) data.is_preferred = body.is_preferred;
      if (body.effective_from !== undefined) {
        data.effective_from = body.effective_from ? new Date(body.effective_from) : null;
      }

      if (Object.keys(data).length === 0) return existing;
      return tx.supplierProduct.update({
        where: { id: existing.id },
        data,
      });
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_product_updated",
        entity: "supplier_product",
        entityId: updated.id,
        after: body as Record<string, unknown>,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const product = await scoped.product.findUnique({
      where: { id: updated.product_id },
      select: { sku: true, name_i18n: true },
    });

    return {
      id: updated.id,
      product_id: updated.product_id,
      product_sku: product?.sku ?? "",
      product_name_i18n: (product?.name_i18n as { en: string; ar: string }) ?? { en: "", ar: "" },
      supplier_sku: updated.supplier_sku,
      unit_cost_cents: updated.unit_cost_cents.toString(),
      currency_code: updated.currency_code,
      is_preferred: updated.is_preferred,
      effective_from: updated.effective_from
        ? updated.effective_from.toISOString().slice(0, 10)
        : null,
    };
  }

  async removeCatalogEntry(
    tenantId: string,
    supplierId: string,
    productId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.supplierProduct.findFirst({
      where: { supplier_id: supplierId, product_id: productId, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: "supplier_product_not_found",
        message: "This supplier does not list that product",
      });
    }
    const now = new Date();
    await scoped.supplierProduct.update({
      where: { id: existing.id },
      data: { deleted_at: now, is_preferred: false },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_product_removed",
        entity: "supplier_product",
        entityId: existing.id,
        before: { supplier_id: supplierId, product_id: productId },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: existing.id, deleted_at: now.toISOString() };
  }

  // ─── documents ─────────────────────────────────────────────────────

  async listDocuments(tenantId: string, supplierId: string): Promise<ApiSupplierDocument[]> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const rows = await scoped.supplierDocument.findMany({
      where: { supplier_id: supplierId, deleted_at: null },
      orderBy: { created_at: "desc" },
    });

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        kind: r.kind as SupplierDocumentKind,
        file_path: r.file_path,
        signed_url: await this.tenantStorage.signedUrl(r.file_path, 300),
        original_filename: r.original_filename,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        notes: r.notes,
        uploaded_by: r.uploaded_by,
        created_at: r.created_at.toISOString(),
        download_url: `/v1/suppliers/${supplierId}/documents/${r.id}/download`,
      })),
    );
  }

  async uploadDocument(
    tenantId: string,
    supplierId: string,
    actorId: string,
    body: { kind: SupplierDocumentKind; notes?: string },
    file: { buffer: Buffer; declaredMime: string; originalName: string },
    ctx: AuditCtx,
  ): Promise<ApiSupplierDocument> {
    await this.loadSupplierOr404(tenantId, supplierId);
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: "file_required",
        message: "Multipart field 'file' is required",
      });
    }

    const { randomUUID } = await import("node:crypto");
    const docId = randomUUID();
    const ext = extFromMime(file.declaredMime);
    const { key, sizeBytes } = await this.tenantStorage.putTenantObject(
      {
        tenantId,
        prefix: `suppliers/${supplierId}/documents`,
        fileId: docId,
        ext,
        contentType: file.declaredMime,
        buffer: file.buffer,
      },
      {
        allowedMimes: ["image/jpeg", "image/png", "application/pdf"],
        maxBytes: 5 * 1024 * 1024,
      },
    );

    const scoped = tenantScoped(tenantId);
    const created = await scoped.supplierDocument.create({
      data: {
        id: docId,
        tenant_id: tenantId,
        supplier_id: supplierId,
        kind: body.kind,
        file_path: key,
        original_filename: file.originalName,
        mime_type: mimeFromExt(ext),
        size_bytes: sizeBytes,
        notes: body.notes ?? null,
        uploaded_by: actorId,
        created_by: actorId,
      },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_document_uploaded",
        entity: "supplier_document",
        entityId: created.id,
        after: {
          doc_id: created.id,
          kind: created.kind,
          original_filename: created.original_filename,
          size_bytes: created.size_bytes,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return {
      id: created.id,
      kind: created.kind as SupplierDocumentKind,
      file_path: created.file_path,
      signed_url: await this.tenantStorage.signedUrl(created.file_path, 300),
      original_filename: created.original_filename,
      mime_type: created.mime_type,
      size_bytes: created.size_bytes,
      notes: created.notes,
      uploaded_by: created.uploaded_by,
      created_at: created.created_at.toISOString(),
      download_url: `/v1/suppliers/${supplierId}/documents/${created.id}/download`,
    };
  }

  async streamDocument(
    tenantId: string,
    supplierId: string,
    docId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const row = await scoped.supplierDocument.findUnique({ where: { id: docId } });
    if (!row || row.deleted_at || row.supplier_id !== supplierId) {
      throw new NotFoundException({
        code: "document_not_found",
        message: "Document not found",
      });
    }
    const buffer = await this.tenantStorage.getObject(row.file_path);
    return { buffer, mime: row.mime_type, filename: row.original_filename };
  }

  async deleteDocument(
    tenantId: string,
    supplierId: string,
    docId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    await this.loadSupplierOr404(tenantId, supplierId);
    const scoped = tenantScoped(tenantId);
    const row = await scoped.supplierDocument.findUnique({ where: { id: docId } });
    if (!row || row.supplier_id !== supplierId) {
      throw new NotFoundException({
        code: "document_not_found",
        message: "Document not found",
      });
    }
    if (row.deleted_at) {
      return { id: row.id, deleted_at: row.deleted_at.toISOString() };
    }
    const now = new Date();
    await scoped.supplierDocument.update({
      where: { id: docId },
      data: { deleted_at: now },
    });

    // Best-effort delete from storage — row is canonical truth.
    try {
      await this.tenantStorage.deleteObject(row.file_path);
    } catch (e) {
      this.logger.warn(
        `failed to delete supplier document object ${row.file_path}: ${(e as Error).message}`,
      );
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "supplier_document_deleted",
        entity: "supplier_document",
        entityId: docId,
        before: { kind: row.kind, original_filename: row.original_filename },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: docId, deleted_at: now.toISOString() };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private async assertProductExists(tenantId: string, productId: string): Promise<void> {
    const product = await tenantScoped(tenantId).product.findUnique({
      where: { id: productId },
      select: { id: true, deleted_at: true },
    });
    if (!product || product.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_product",
        message: "Product not found for this tenant",
      });
    }
  }
}

function bigintToString(v: bigint | number | null | undefined): string {
  if (v == null) return "0";
  if (typeof v === "bigint") return v.toString();
  return String(v);
}

function numberFrom(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    default:
      // TenantStorageService re-validates with magic bytes; defer the actual
      // rejection to that layer for a single, canonical error message.
      return mime.split("/")[1] ?? "bin";
  }
}

function mimeFromExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === "jpg" || lower === "jpeg") return "image/jpeg";
  if (lower === "png") return "image/png";
  if (lower === "pdf") return "application/pdf";
  return "application/octet-stream";
}
