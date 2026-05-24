import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { ListSyncConflictsQuery } from "./dto/list.dto";
import type { ResolveSyncConflictBody } from "./dto/resolve.dto";

const READER_ROLES = new Set(["owner", "manager", "auditor"]);
const RESOLVER_ROLES = new Set(["owner", "manager"]);

export type SyncConflictKind =
  | "negative_stock"
  | "duplicate_uuid"
  | "product_unknown"
  | "price_drift";

export type SyncConflictStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "ignored";

export interface ApiSyncConflict {
  id: string;
  conflict_kind: SyncConflictKind;
  reference_table: string;
  reference_id: string;
  details: unknown;
  resolution_status: SyncConflictStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  occurred_at: string;
  created_at: string;
}

export interface ListSyncConflictsResponse {
  items: ApiSyncConflict[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncConflictsSummary {
  open: number;
  acknowledged: number;
  resolved: number;
  ignored: number;
  total: number;
}

@Injectable()
export class SyncConflictsService {
  private readonly logger = new Logger(SyncConflictsService.name);

  constructor(private readonly audit: AuditService) {}

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read sync conflicts",
      });
    }
  }

  assertCanResolve(role: string): void {
    if (!RESOLVER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can resolve conflicts",
      });
    }
  }

  async list(tenantId: string, opts: ListSyncConflictsQuery): Promise<ListSyncConflictsResponse> {
    const scoped = tenantScoped(tenantId);
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (opts.status) where.resolution_status = opts.status;
    if (opts.conflict_kind) where.conflict_kind = opts.conflict_kind;

    const [rows, total] = await Promise.all([
      scoped.syncConflict.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      scoped.syncConflict.count({ where }),
    ]);

    // Resolve reviewer names (one lookup; could be N+1 if many — bounded by page limit).
    const reviewerIds = Array.from(
      new Set(rows.map((r) => r.reviewed_by).filter((id): id is string => id !== null)),
    );
    const reviewers = reviewerIds.length
      ? await scoped.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(reviewers.map((u) => [u.id, u.name]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        conflict_kind: r.conflict_kind as SyncConflictKind,
        reference_table: r.reference_table,
        reference_id: r.reference_id,
        details: r.details,
        resolution_status: r.resolution_status as SyncConflictStatus,
        reviewed_by: r.reviewed_by,
        reviewed_by_name: r.reviewed_by ? (nameById.get(r.reviewed_by) ?? null) : null,
        reviewed_at: r.reviewed_at?.toISOString() ?? null,
        review_notes: r.review_notes,
        occurred_at: r.occurred_at.toISOString(),
        created_at: r.created_at.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  async resolve(
    tenantId: string,
    conflictId: string,
    actorId: string,
    body: ResolveSyncConflictBody,
    ctx: AuditCtx,
  ): Promise<ApiSyncConflict> {
    const scoped = tenantScoped(tenantId);
    const existing = await scoped.syncConflict.findUnique({ where: { id: conflictId } });
    if (!existing || existing.tenant_id !== tenantId) {
      throw new NotFoundException({
        code: "sync_conflict_not_found",
        message: "Conflict not found",
      });
    }
    if (existing.resolution_status !== "open") {
      throw new ConflictException({
        code: "not_resolvable",
        message: "This conflict has already been reviewed",
      });
    }

    const reviewedAt = new Date();
    const updated = await scoped.syncConflict.update({
      where: { id: conflictId },
      data: {
        resolution_status: body.resolution_status,
        reviewed_by: actorId,
        reviewed_at: reviewedAt,
        review_notes: body.review_notes ?? null,
      },
    });

    await this.audit
      .writeTenantScoped(ctx, {
        action: "sync_conflict_resolved",
        entity: "sync_conflict",
        entityId: conflictId,
        before: { resolution_status: "open" },
        after: {
          resolution_status: body.resolution_status,
          reviewed_at: reviewedAt.toISOString(),
          review_notes: body.review_notes ?? null,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const reviewer = await scoped.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });

    return {
      id: updated.id,
      conflict_kind: updated.conflict_kind as SyncConflictKind,
      reference_table: updated.reference_table,
      reference_id: updated.reference_id,
      details: updated.details,
      resolution_status: updated.resolution_status as SyncConflictStatus,
      reviewed_by: updated.reviewed_by,
      reviewed_by_name: reviewer?.name ?? null,
      reviewed_at: updated.reviewed_at?.toISOString() ?? null,
      review_notes: updated.review_notes,
      occurred_at: updated.occurred_at.toISOString(),
      created_at: updated.created_at.toISOString(),
    };
  }

  async summary(tenantId: string): Promise<SyncConflictsSummary> {
    const scoped = tenantScoped(tenantId);
    const grouped = await scoped.syncConflict.groupBy({
      by: ["resolution_status"],
      _count: { _all: true },
    });
    const counts: SyncConflictsSummary = {
      open: 0,
      acknowledged: 0,
      resolved: 0,
      ignored: 0,
      total: 0,
    };
    for (const g of grouped) {
      const status = g.resolution_status as SyncConflictStatus;
      counts[status] = g._count._all;
      counts.total += g._count._all;
    }
    return counts;
  }
}
