import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";

/**
 * Prisma's P2002 meta.target for compound unique indexes is inconsistent: it
 * can be a column-name array (["tenant_id", "phone"]) or a single index-name
 * string ("customers_tenant_id_phone_key"). Match against both shapes.
 */
function detectCustomerConflict(err: unknown): ConflictException | null {
  const meta = (err as { meta?: { target?: string[] | string } }).meta;
  const target = meta?.target;
  const flat = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (/\bemail\b/.test(flat)) {
    return new ConflictException({
      code: "email_taken",
      message: "A customer with this email already exists",
      fields: { email: "email_taken" },
    });
  }
  if (/\bphone\b/.test(flat)) {
    return new ConflictException({
      code: "phone_taken",
      message: "A customer with this phone already exists",
      fields: { phone: "phone_taken" },
    });
  }
  return null;
}
import type { CreateCustomerBody } from "./dto/create-customer.dto";
import type { UpdateCustomerBody } from "./dto/update-customer.dto";
import type { ListCustomersQuery } from "./dto/list-customers.dto";

export interface ApiCustomerSummary {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  store_credit_balance_minor: string;
  store_credit_currency_code: string | null;
  last_sale_at: string | null;
  sales_count: number;
  created_at: string;
}

export interface ApiCustomerDetail extends ApiCustomerSummary {
  notes: string | null;
  recent_sales: ApiCustomerSale[];
}

export interface ApiCustomerSale {
  id: string;
  code: string;
  occurred_at: string;
  total_cents: string;
  currency_code: string;
  payment_status: string;
  branch_id: string;
}

interface RawCustomerListRow {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  store_credit_balance_minor: bigint | number;
  store_credit_currency_code: string | null;
  created_at: Date;
  last_sale_at: Date | null;
  sales_count: bigint | number;
}

interface RawCustomerTotalRow {
  total: bigint | number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListCustomersQuery,
  ): Promise<{ items: ApiCustomerSummary[]; total: number; page: number; limit: number }> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(query: string, ...params: unknown[]) => Promise<T>;
    };

    const skip = (q.page - 1) * q.limit;
    const search = q.search?.trim();
    // Escape LIKE wildcards so user input is treated literally.
    const searchEscaped = search
      ? `%${search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
      : null;

    const params: unknown[] = [tenantId];
    let searchClause = "";
    if (searchEscaped) {
      params.push(searchEscaped);
      searchClause =
        "AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2 OR c.code ILIKE $2)";
    }

    const rows = await client.$queryRawUnsafe<RawCustomerListRow[]>(
      `SELECT c.id,
              c.code,
              c.name,
              c.phone,
              c.email,
              c.store_credit_balance_minor,
              c.store_credit_currency_code,
              c.created_at,
              (SELECT MAX(s.occurred_at) FROM sales s
                 WHERE s.tenant_id = c.tenant_id AND s.customer_id = c.id AND s.deleted_at IS NULL)
                AS last_sale_at,
              (SELECT COUNT(*)::bigint FROM sales s
                 WHERE s.tenant_id = c.tenant_id AND s.customer_id = c.id AND s.deleted_at IS NULL)
                AS sales_count
       FROM customers c
       WHERE c.tenant_id = $1::uuid
         AND c.deleted_at IS NULL
         ${searchClause}
       ORDER BY c.created_at DESC
       LIMIT ${q.limit} OFFSET ${skip}`,
      ...params,
    );

    const totalRows = await client.$queryRawUnsafe<RawCustomerTotalRow[]>(
      `SELECT COUNT(*)::bigint AS total
       FROM customers c
       WHERE c.tenant_id = $1::uuid
         AND c.deleted_at IS NULL
         ${searchClause}`,
      ...params,
    );
    const total = totalRows[0] ? Number(totalRows[0].total) : 0;

    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, customerId: string): Promise<ApiCustomerDetail> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.customer.findUnique({ where: { id: customerId } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "customer_not_found",
        message: "Customer not found",
      });
    }

    const [recent, salesCount, lastSale] = await Promise.all([
      scoped.sale.findMany({
        where: { customer_id: customerId, deleted_at: null },
        orderBy: { occurred_at: "desc" },
        take: 5,
        select: {
          id: true,
          code: true,
          occurred_at: true,
          total_cents: true,
          currency_code: true,
          payment_status: true,
          branch_id: true,
        },
      }),
      scoped.sale.count({
        where: { customer_id: customerId, deleted_at: null },
      }),
      scoped.sale.findFirst({
        where: { customer_id: customerId, deleted_at: null },
        orderBy: { occurred_at: "desc" },
        select: { occurred_at: true },
      }),
    ]);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      store_credit_balance_minor: row.store_credit_balance_minor.toString(),
      store_credit_currency_code: row.store_credit_currency_code,
      last_sale_at: lastSale?.occurred_at.toISOString() ?? null,
      sales_count: salesCount,
      created_at: row.created_at.toISOString(),
      recent_sales: recent.map((s) => ({
        id: s.id,
        code: s.code,
        occurred_at: s.occurred_at.toISOString(),
        total_cents: s.total_cents.toString(),
        currency_code: s.currency_code,
        payment_status: s.payment_status,
        branch_id: s.branch_id,
      })),
    };
  }

  // ─── mutations ───────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateCustomerBody,
    ctx: AuditCtx,
  ): Promise<ApiCustomerDetail> {
    const scoped = tenantScoped(tenantId);

    // Pre-check for known unique conflicts so we can return field-specific
    // codes. Prisma's P2002 meta.target is inconsistent across versions for
    // compound (tenant_id, X) uniques. The window between this check and the
    // create is fine — the database remains the source of truth via P2002.
    await this.assertNoUniqueConflict(tenantId, body.email ?? null, body.phone ?? null);

    let created;
    try {
      created = await scoped.customer.create({
        data: {
          tenant_id: tenantId,
          name: body.name,
          phone: body.phone ?? null,
          email: body.email ?? null,
          notes: body.notes ?? null,
          code: body.code ?? null,
          created_by: actorId,
        },
      });
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code === "P2002") {
        const conflict = detectCustomerConflict(err);
        if (conflict) throw conflict;
        throw new ConflictException({
          code: "customer_conflict",
          message: "Customer conflict",
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "customer_created",
        entity: "customer",
        entityId: created.id,
        after: {
          name: created.name,
          phone: created.phone,
          email: created.email,
          code: created.code,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, created.id);
  }

  async update(
    tenantId: string,
    customerId: string,
    body: UpdateCustomerBody,
    ctx: AuditCtx,
  ): Promise<ApiCustomerDetail> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.customer.findUnique({ where: { id: customerId } });
    if (!existing || existing.deleted_at || existing.tenant_id !== tenantId) {
      throw new NotFoundException({
        code: "customer_not_found",
        message: "Customer not found",
      });
    }

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of ["name", "phone", "email", "notes", "code"] as const) {
      if (body[k] !== undefined) {
        data[k] = body[k];
        before[k] = existing[k];
        after[k] = body[k];
      }
    }

    const nextEmail = body.email !== undefined ? body.email : existing.email;
    const nextPhone = body.phone !== undefined ? body.phone : existing.phone;
    if (nextEmail !== existing.email || nextPhone !== existing.phone) {
      await this.assertNoUniqueConflict(tenantId, nextEmail, nextPhone, customerId);
    }

    try {
      await scoped.customer.update({ where: { id: customerId }, data });
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code === "P2002") {
        const conflict = detectCustomerConflict(err);
        if (conflict) throw conflict;
        throw new ConflictException({
          code: "customer_conflict",
          message: "Customer conflict",
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "customer_updated",
        entity: "customer",
        entityId: customerId,
        before,
        after,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, customerId);
  }

  async softDelete(
    tenantId: string,
    customerId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted: true }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.customer.findUnique({ where: { id: customerId } });
    if (!existing || existing.tenant_id !== tenantId) {
      throw new NotFoundException({
        code: "customer_not_found",
        message: "Customer not found",
      });
    }
    // Idempotent — already-deleted returns the same shape.
    if (existing.deleted_at) {
      return { id: customerId, deleted: true };
    }

    if (existing.store_credit_balance_minor !== BigInt(0)) {
      throw new ConflictException({
        code: "has_store_credit",
        message: "Cannot delete: customer has store credit balance. Zero the balance first.",
      });
    }

    await scoped.customer.update({
      where: { id: customerId },
      data: { deleted_at: new Date() },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "customer_deleted",
        entity: "customer",
        entityId: customerId,
        before: {
          name: existing.name,
          phone: existing.phone,
          email: existing.email,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: customerId, deleted: true };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async assertNoUniqueConflict(
    tenantId: string,
    email: string | null,
    phone: string | null,
    excludeId?: string,
  ): Promise<void> {
    if (!email && !phone) return;
    const scoped = tenantScoped(tenantId);
    if (email) {
      const collision = await scoped.customer.findFirst({
        where: {
          email,
          deleted_at: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (collision) {
        throw new ConflictException({
          code: "email_taken",
          message: "A customer with this email already exists",
          fields: { email: "email_taken" },
        });
      }
    }
    if (phone) {
      const collision = await scoped.customer.findFirst({
        where: {
          phone,
          deleted_at: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (collision) {
        throw new ConflictException({
          code: "phone_taken",
          message: "A customer with this phone already exists",
          fields: { phone: "phone_taken" },
        });
      }
    }
  }

  private toSummary(r: RawCustomerListRow): ApiCustomerSummary {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      store_credit_balance_minor:
        typeof r.store_credit_balance_minor === "bigint"
          ? r.store_credit_balance_minor.toString()
          : String(r.store_credit_balance_minor),
      store_credit_currency_code: r.store_credit_currency_code,
      last_sale_at: r.last_sale_at ? r.last_sale_at.toISOString() : null,
      sales_count: typeof r.sales_count === "bigint" ? Number(r.sales_count) : Number(r.sales_count),
      created_at: r.created_at.toISOString(),
    };
  }
}
