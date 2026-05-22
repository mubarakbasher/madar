import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// Tenant.default_tax_class_id lives on the platform-scoped tenants table.
// Reading/updating it requires adminPrisma (RLS bypass), same pattern as
// suppliers using adminPrisma for tenant.default_currency_code.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { ListTaxClassesQuery } from "./dto/list.dto";
import type { CreateTaxClassBody } from "./dto/create.dto";
import type { UpdateTaxClassBody } from "./dto/update.dto";

const OWNER_ONLY = new Set(["owner"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

export interface ApiTaxClass {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  rate_bps: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface ListTaxClassesResponse {
  items: ApiTaxClass[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TaxClassesService {
  private readonly logger = new Logger(TaxClassesService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── role gates ────────────────────────────────────────────────────

  assertCanWrite(role: string): void {
    if (!OWNER_ONLY.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the owner can perform this action",
      });
    }
  }

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read tax classes",
      });
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────

  private async getDefaultTaxClassId(tenantId: string): Promise<string | null> {
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_tax_class_id: true },
    });
    return tenant?.default_tax_class_id ?? null;
  }

  private toApi(
    row: {
      id: string;
      code: string;
      name_i18n: unknown;
      rate_bps: number;
      is_active: boolean;
      created_at: Date;
    },
    defaultId: string | null,
  ): ApiTaxClass {
    return {
      id: row.id,
      code: row.code,
      name_i18n: row.name_i18n as { en: string; ar: string },
      rate_bps: row.rate_bps,
      is_active: row.is_active,
      is_default: row.id === defaultId,
      created_at: row.created_at.toISOString(),
    };
  }

  async loadOr404(tenantId: string, id: string) {
    const row = await tenantScoped(tenantId).taxClass.findUnique({ where: { id } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({
        code: "tax_class_not_found",
        message: "Tax class not found",
      });
    }
    return row;
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async list(tenantId: string, q: ListTaxClassesQuery): Promise<ListTaxClassesResponse> {
    const scoped = tenantScoped(tenantId);
    const skip = (q.page - 1) * q.limit;

    const where: Record<string, unknown> = { deleted_at: null };
    if (q.active_only === true) where.is_active = true;
    if (q.search) {
      const needle = q.search;
      where.OR = [
        { code: { contains: needle, mode: "insensitive" } },
        // Postgres JSON path via Prisma — match on the en/ar values.
        { name_i18n: { path: ["en"], string_contains: needle } },
        { name_i18n: { path: ["ar"], string_contains: needle } },
      ];
    }

    const [rows, total, defaultId] = await Promise.all([
      scoped.taxClass.findMany({
        where,
        orderBy: { code: "asc" },
        skip,
        take: q.limit,
      }),
      scoped.taxClass.count({ where }),
      this.getDefaultTaxClassId(tenantId),
    ]);

    return {
      items: rows.map((r) => this.toApi(r, defaultId)),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, id: string): Promise<ApiTaxClass> {
    const row = await this.loadOr404(tenantId, id);
    const defaultId = await this.getDefaultTaxClassId(tenantId);
    return this.toApi(row, defaultId);
  }

  // ─── mutations ─────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateTaxClassBody,
    ctx: AuditCtx,
  ): Promise<ApiTaxClass> {
    const scoped = tenantScoped(tenantId);
    let created;
    try {
      created = await scoped.taxClass.create({
        data: {
          tenant_id: tenantId,
          code: body.code,
          name_i18n: body.name_i18n,
          rate_bps: body.rate_bps,
          is_active: body.is_active ?? true,
          created_by: actorId,
        },
      });
    } catch (err) {
      if ((err as { code?: string } | undefined)?.code === "P2002") {
        throw new ConflictException({
          code: "tax_class_code_taken",
          message: "A tax class with this code already exists",
          fields: { code: "tax_class_code_taken" },
        });
      }
      throw err;
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "tax_class_created",
        entity: "tax_class",
        entityId: created.id,
        after: {
          code: created.code,
          rate_bps: created.rate_bps,
          name_en: (created.name_i18n as { en?: string })?.en ?? null,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, created.id);
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateTaxClassBody,
    ctx: AuditCtx,
  ): Promise<ApiTaxClass> {
    const existing = await this.loadOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (body.code !== undefined && body.code !== existing.code) {
      data.code = body.code;
      before.code = existing.code;
      after.code = body.code;
    }
    if (body.name_i18n !== undefined) {
      data.name_i18n = body.name_i18n;
      before.name_i18n = existing.name_i18n;
      after.name_i18n = body.name_i18n;
    }
    if (body.rate_bps !== undefined && body.rate_bps !== existing.rate_bps) {
      data.rate_bps = body.rate_bps;
      before.rate_bps = existing.rate_bps;
      after.rate_bps = body.rate_bps;
    }
    if (body.is_active !== undefined && body.is_active !== existing.is_active) {
      data.is_active = body.is_active;
      before.is_active = existing.is_active;
      after.is_active = body.is_active;
    }

    if (Object.keys(data).length > 0) {
      try {
        await scoped.taxClass.update({ where: { id }, data });
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === "P2002") {
          throw new ConflictException({
            code: "tax_class_code_taken",
            message: "A tax class with this code already exists",
          });
        }
        throw err;
      }

      await this.audit
        .writeTenantScoped(ctx, {
          action: "tax_class_updated",
          entity: "tax_class",
          entityId: id,
          before,
          after,
        })
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    return this.getOne(tenantId, id);
  }

  async setDefault(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<ApiTaxClass> {
    // Ensure the class exists (RLS-scoped) before flipping the platform-table flag.
    await this.loadOr404(tenantId, id);

    const previous = await this.getDefaultTaxClassId(tenantId);
    if (previous === id) {
      // Idempotent: already the default.
      return this.getOne(tenantId, id);
    }

    await adminPrisma.tenant.update({
      where: { id: tenantId },
      data: { default_tax_class_id: id },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "tax_class_default_set",
        entity: "tax_class",
        entityId: id,
        before: { default_tax_class_id: previous },
        after: { default_tax_class_id: id },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, id);
  }

  async softDelete(
    tenantId: string,
    id: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted_at: string }> {
    const existing = await this.loadOr404(tenantId, id);
    const scoped = tenantScoped(tenantId);

    const defaultId = await this.getDefaultTaxClassId(tenantId);
    if (defaultId === id) {
      throw new ConflictException({
        code: "tax_class_in_use",
        message: "Cannot delete the default tax class — set another default first",
      });
    }

    const inUseCount = await scoped.product.count({
      where: { tax_class_id: id, deleted_at: null },
    });
    if (inUseCount > 0) {
      throw new ConflictException({
        code: "tax_class_in_use",
        message: `Cannot delete tax class: ${inUseCount} product(s) reference it`,
        fields: { products: inUseCount.toString() },
      });
    }

    const now = new Date();
    await scoped.taxClass.update({
      where: { id },
      data: { deleted_at: now, is_active: false },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "tax_class_deleted",
        entity: "tax_class",
        entityId: id,
        before: { code: existing.code, rate_bps: existing.rate_bps },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id, deleted_at: now.toISOString() };
  }
}
