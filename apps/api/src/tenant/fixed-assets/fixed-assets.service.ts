import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { CreateFixedAssetBody } from "./dto/create-fixed-asset.dto";
import type { UpdateFixedAssetBody } from "./dto/update-fixed-asset.dto";
import type { ListFixedAssetsQuery } from "./dto/list-fixed-assets.dto";

interface I18nText {
  en: string;
  ar: string;
}

export interface ApiFixedAsset {
  id: string;
  branch_id: string;
  branch_name_i18n: I18nText | null;
  name_i18n: I18nText;
  quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RawAssetListRow {
  id: string;
  branch_id: string;
  name_i18n: I18nText;
  branch_name_i18n: I18nText | null;
  quantity: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawTotalRow {
  total: bigint | number;
}

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── reads ───────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    q: ListFixedAssetsQuery,
  ): Promise<{ items: ApiFixedAsset[]; total: number; page: number; limit: number }> {
    const client = tenantScoped(tenantId) as unknown as {
      $queryRawUnsafe: <T = unknown>(query: string, ...params: unknown[]) => Promise<T>;
    };

    const skip = (q.page - 1) * q.limit;
    const search = q.search?.trim();
    const searchEscaped = search
      ? `%${search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
      : null;

    const params: unknown[] = [tenantId];
    const filters: string[] = [];
    if (q.branch_id) {
      params.push(q.branch_id);
      filters.push(`AND a.branch_id = $${params.length}::uuid`);
    }
    if (searchEscaped) {
      params.push(searchEscaped);
      const p = `$${params.length}`;
      filters.push(`AND (a.name_i18n->>'en' ILIKE ${p} OR a.name_i18n->>'ar' ILIKE ${p})`);
    }
    const filterClause = filters.join("\n         ");

    const rows = await client.$queryRawUnsafe<RawAssetListRow[]>(
      `SELECT a.id,
              a.branch_id,
              a.name_i18n,
              a.quantity,
              a.notes,
              a.created_at,
              a.updated_at,
              b.name_i18n AS branch_name_i18n
       FROM fixed_assets a
       LEFT JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1::uuid
         AND a.deleted_at IS NULL
         ${filterClause}
       ORDER BY a.created_at DESC
       LIMIT ${q.limit} OFFSET ${skip}`,
      ...params,
    );

    const totalRows = await client.$queryRawUnsafe<RawTotalRow[]>(
      `SELECT COUNT(*)::bigint AS total
       FROM fixed_assets a
       WHERE a.tenant_id = $1::uuid
         AND a.deleted_at IS NULL
         ${filterClause}`,
      ...params,
    );
    const total = totalRows[0] ? Number(totalRows[0].total) : 0;

    return {
      items: rows.map((r) => ({
        id: r.id,
        branch_id: r.branch_id,
        branch_name_i18n: r.branch_name_i18n ?? null,
        name_i18n: r.name_i18n,
        quantity: Number(r.quantity),
        notes: r.notes,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, assetId: string): Promise<ApiFixedAsset> {
    const scoped = tenantScoped(tenantId);
    const row = await scoped.fixedAsset.findUnique({ where: { id: assetId } });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "asset_not_found", message: "Asset not found" });
    }
    const branch = await scoped.branch.findUnique({
      where: { id: row.branch_id },
      select: { name_i18n: true },
    });
    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name_i18n: (branch?.name_i18n as unknown as I18nText) ?? null,
      name_i18n: row.name_i18n as unknown as I18nText,
      quantity: row.quantity,
      notes: row.notes,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  // ─── mutations ─────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    actorId: string,
    body: CreateFixedAssetBody,
    ctx: AuditCtx,
  ): Promise<ApiFixedAsset> {
    await this.assertBranchExists(tenantId, body.branch_id);
    const scoped = tenantScoped(tenantId);

    let created;
    try {
      created = await scoped.fixedAsset.create({
        data: {
          tenant_id: tenantId,
          branch_id: body.branch_id,
          name_i18n: body.name_i18n,
          quantity: body.quantity,
          notes: body.notes ?? null,
          created_by: actorId,
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "fixed_asset_created",
        entity: "fixed_asset",
        entityId: created.id,
        after: {
          branch_id: created.branch_id,
          name_i18n: created.name_i18n,
          quantity: created.quantity,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, created.id);
  }

  async update(
    tenantId: string,
    assetId: string,
    body: UpdateFixedAssetBody,
    ctx: AuditCtx,
  ): Promise<ApiFixedAsset> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.fixedAsset.findUnique({ where: { id: assetId } });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException({ code: "asset_not_found", message: "Asset not found" });
    }

    if (body.branch_id !== undefined && body.branch_id !== existing.branch_id) {
      await this.assertBranchExists(tenantId, body.branch_id);
    }

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of ["branch_id", "name_i18n", "quantity", "notes"] as const) {
      if (body[k] !== undefined) {
        data[k] = body[k];
        before[k] = existing[k];
        after[k] = body[k];
      }
    }

    try {
      await scoped.fixedAsset.update({ where: { id: assetId }, data });
    } catch (err) {
      throw this.mapWriteError(err);
    }

    await this.audit
      .writeTenantScoped(ctx, {
        action: "fixed_asset_updated",
        entity: "fixed_asset",
        entityId: assetId,
        before,
        after,
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getOne(tenantId, assetId);
  }

  async softDelete(
    tenantId: string,
    assetId: string,
    ctx: AuditCtx,
  ): Promise<{ id: string; deleted: true }> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.fixedAsset.findUnique({ where: { id: assetId } });
    if (!existing) {
      throw new NotFoundException({ code: "asset_not_found", message: "Asset not found" });
    }
    if (existing.deleted_at) {
      return { id: assetId, deleted: true };
    }

    await scoped.fixedAsset.update({
      where: { id: assetId },
      data: { deleted_at: new Date() },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "fixed_asset_deleted",
        entity: "fixed_asset",
        entityId: assetId,
        before: { branch_id: existing.branch_id, name_i18n: existing.name_i18n },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { id: assetId, deleted: true };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async assertBranchExists(tenantId: string, branchId: string): Promise<void> {
    const scoped = tenantScoped(tenantId);
    const branch = await scoped.branch.findUnique({
      where: { id: branchId },
      select: { id: true, deleted_at: true },
    });
    if (!branch || branch.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "That branch does not exist",
      });
    }
  }

  /** Maps the partial-unique violation to a friendly 409; rethrows otherwise. */
  private mapWriteError(err: unknown): unknown {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "P2002") {
      return new ConflictException({
        code: "asset_exists",
        message: "This asset already exists in this branch — edit its quantity instead.",
      });
    }
    return err;
  }
}
