import { randomUUID } from "node:crypto";
import {
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
import type { CreateQuotationBody } from "./dto/create.dto";
import type { ListQuotationsQuery } from "./dto/list.dto";

const BRANCH_WIDE_ROLES = new Set(["owner", "manager"]);

export interface ApiQuotationSummary {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  customer_name: string | null;
  note: string | null;
  status: string;
  effective_status: string;
  total_cents: string;
  currency_code: string;
  valid_until: string;
  converted_sale_id: string | null;
  created_at: string;
}

export interface ApiQuotationLine {
  product_id: string;
  name_i18n: { en: string; ar: string };
  sku: string | null;
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  note: string | null;
}

export interface ApiQuotationPayload {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  note: string | null;
  status: string;
  effective_status: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  currency_code: string;
  valid_until: string;
  converted_sale_id: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  lines: ApiQuotationLine[];
}

export interface QuotationForConvert {
  id: string;
  tenant_id: string;
  branch_id: string;
  currency_code: string;
  valid_until: Date;
  status: string;
  lines: Array<{
    product_id: string;
    unit_price_cents: bigint;
    discount_cents: bigint;
  }>;
}

function generateQuotationCode(): string {
  const bytes = randomUUID().replace(/-/g, "");
  const num = parseInt(bytes.slice(0, 8), 16);
  return `QT-${num.toString(36).toUpperCase().padStart(6, "0")}`;
}

function effectiveStatus(status: string, validUntil: Date): string {
  if (status === "open" && validUntil.getTime() < Date.now()) return "expired";
  return status;
}

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── list ──────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    actorId: string,
    role: string,
    q: ListQuotationsQuery,
  ): Promise<{ items: ApiQuotationSummary[]; total: number }> {
    const scoped = tenantScoped(tenantId);
    const restrictToSelf = !BRANCH_WIDE_ROLES.has(role);

    const where: Record<string, unknown> = {
      branch_id: q.branch_id,
      deleted_at: null,
    };
    if (restrictToSelf) {
      where.cashier_id = actorId;
    }
    if (q.status && q.status !== "expired") {
      where.status = q.status;
    } else if (q.status === "expired") {
      where.status = "open";
      where.valid_until = { lt: new Date() };
    }

    const [rows, total] = await Promise.all([
      scoped.quotation.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      scoped.quotation.count({ where }),
    ]);

    if (rows.length === 0) return { items: [], total };

    const customerIds = Array.from(
      new Set(rows.map((r) => r.customer_id).filter((v): v is string => v !== null)),
    );
    const customers = customerIds.length
      ? await scoped.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [];
    const customerById = new Map(customers.map((c) => [c.id, c.name]));

    const items: ApiQuotationSummary[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      branch_id: r.branch_id,
      cashier_id: r.cashier_id,
      customer_id: r.customer_id,
      customer_name: r.customer_id ? customerById.get(r.customer_id) ?? null : null,
      note: r.note,
      status: r.status,
      effective_status: effectiveStatus(r.status, r.valid_until),
      total_cents: r.total_cents.toString(),
      currency_code: r.currency_code,
      valid_until: r.valid_until.toISOString(),
      converted_sale_id: r.converted_sale_id,
      created_at: r.created_at.toISOString(),
    }));

    return { items, total };
  }

  // ─── create ────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateQuotationBody,
    ctx: AuditCtx,
  ): Promise<ApiQuotationPayload> {
    const scoped = tenantScoped(tenantId);

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
      select: { id: true, sku: true, name_i18n: true },
    });
    if (products.length !== productIds.length) {
      throw new UnprocessableEntityException({
        code: "unknown_product",
        message: "One or more products are not in the catalog",
      });
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const validUntil = new Date(Date.now() + body.valid_days * 24 * 60 * 60 * 1000);

    let quotationId: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateQuotationCode();
      try {
        const created = await withTenantTx(tenantId, async (tx) => {
          const quotation = await tx.quotation.create({
            data: {
              tenant_id: tenantId,
              branch_id: body.branch_id,
              cashier_id: actorId,
              customer_id: body.customer_id ?? null,
              code: candidate,
              note: body.note ?? null,
              subtotal_cents: BigInt(body.subtotal_cents),
              discount_cents: BigInt(body.discount_cents),
              tax_cents: BigInt(body.tax_cents),
              total_cents: BigInt(body.total_cents),
              currency_code: body.currency_code,
              valid_until: validUntil,
              created_by: actorId,
            },
          });
          for (const line of body.lines) {
            const product = productById.get(line.product_id)!;
            await tx.quotationLine.create({
              data: {
                tenant_id: tenantId,
                quotation_id: quotation.id,
                product_id: line.product_id,
                name_i18n: product.name_i18n as object,
                sku: product.sku,
                qty: line.qty,
                unit_price_cents: BigInt(line.unit_price_cents),
                discount_cents: BigInt(line.discount_cents ?? "0"),
                note: line.note ?? null,
              },
            });
          }
          return quotation;
        });
        quotationId = created.id;
        break;
      } catch (err) {
        const code = (err as { code?: string } | undefined)?.code;
        if (code === "P2002") {
          continue; // (tenant_id, code) collision → retry with a fresh code.
        }
        throw err;
      }
    }
    if (!quotationId) {
      throw new ConflictException({
        code: "quotation_code_collision",
        message: "Could not generate a unique quotation code, try again",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "quotation_created",
        entity: "quotation",
        entityId: quotationId,
        after: {
          branch_id: body.branch_id,
          cashier_id: actorId,
          line_count: body.lines.length,
          total_cents: body.total_cents,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toPayload(tenantId, quotationId);
  }

  // ─── detail ────────────────────────────────────────────────────────

  async detail(tenantId: string, actorId: string, role: string, id: string): Promise<ApiQuotationPayload> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.quotation.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "quotation_not_found",
        message: "Quotation not found",
      });
    }
    this.assertCanAccess(row.cashier_id, actorId, role);
    return this.toPayload(tenantId, id);
  }

  // ─── cancel ────────────────────────────────────────────────────────

  async cancel(
    tenantId: string,
    actorId: string,
    role: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<ApiQuotationPayload> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.quotation.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "quotation_not_found",
        message: "Quotation not found",
      });
    }
    this.assertCanAccess(row.cashier_id, actorId, role);

    // Conditional update (not read-then-write): a concurrent convert() could
    // otherwise flip status to "converted" between our read above and an
    // unconditional write here, and this cancel would silently overwrite it
    // back to "cancelled". The WHERE clause makes that race lose cleanly —
    // count 0 means the status changed under us, so re-read and react.
    const claimed = await scoped.quotation.updateMany({
      where: { id, status: "open" },
      data: { status: "cancelled", cancelled_at: new Date() },
    });

    if (claimed.count === 0) {
      const current = await scoped.quotation.findUnique({ where: { id } });
      if (current?.status === "cancelled") {
        // Already cancelled (e.g. a duplicate request) — idempotent success.
        return this.toPayload(tenantId, id);
      }
      throw new ConflictException({
        code: "quotation_not_open",
        message: "Quotation has already been converted to a sale",
      });
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "quotation_cancelled",
        entity: "quotation",
        entityId: id,
        before: { status: row.status },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toPayload(tenantId, id);
  }

  // ─── exported for Task 3 (conversion in sales service) ─────────────

  async getOpenForConvert(tenantId: string, id: string): Promise<QuotationForConvert> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.quotation.findUnique({
      where: { id },
      include: {
        lines: {
          select: { product_id: true, unit_price_cents: true, discount_cents: true },
        },
      },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "quotation_not_found",
        message: "Quotation not found",
      });
    }
    if (row.status !== "open") {
      throw new ConflictException({
        code: "quotation_not_open",
        message: "Quotation is not open",
      });
    }
    if (row.valid_until.getTime() < Date.now()) {
      throw new ConflictException({
        code: "quotation_expired",
        message: "Quotation has expired",
      });
    }
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      currency_code: row.currency_code,
      valid_until: row.valid_until,
      status: row.status,
      lines: row.lines.map((l) => ({
        product_id: l.product_id,
        unit_price_cents: l.unit_price_cents,
        discount_cents: l.discount_cents,
      })),
    };
  }

  // ─── helpers ───────────────────────────────────────────────────────

  private assertCanAccess(ownerId: string, actorId: string, role: string): void {
    if (ownerId === actorId) return;
    if (BRANCH_WIDE_ROLES.has(role)) return;
    throw new ForbiddenException({
      code: "forbidden_not_owner",
      message: "You can only act on your own quotations",
    });
  }

  private async toPayload(tenantId: string, id: string): Promise<ApiQuotationPayload> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.quotation.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { created_at: "asc" },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: "quotation_not_found",
        message: "Quotation not found",
      });
    }
    return {
      id: row.id,
      code: row.code,
      branch_id: row.branch_id,
      cashier_id: row.cashier_id,
      customer_id: row.customer_id,
      note: row.note,
      status: row.status,
      effective_status: effectiveStatus(row.status, row.valid_until),
      subtotal_cents: row.subtotal_cents.toString(),
      discount_cents: row.discount_cents.toString(),
      tax_cents: row.tax_cents.toString(),
      total_cents: row.total_cents.toString(),
      currency_code: row.currency_code,
      valid_until: row.valid_until.toISOString(),
      converted_sale_id: row.converted_sale_id,
      converted_at: row.converted_at ? row.converted_at.toISOString() : null,
      cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
      lines: row.lines.map(
        (l): ApiQuotationLine => ({
          product_id: l.product_id,
          name_i18n: l.name_i18n as { en: string; ar: string },
          sku: l.sku,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents.toString(),
          discount_cents: l.discount_cents.toString(),
          note: l.note,
        }),
      ),
    };
  }
}
