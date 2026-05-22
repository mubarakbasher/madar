import { Injectable } from "@nestjs/common";
import { adminPrisma } from "@madar/db";

export interface PlatformAuditItem {
  id: string;
  platform_user: { id: string; email: string; name: string };
  action: string;
  target_tenant: { id: string; slug: string; name: string } | null;
  target_entity: string | null;
  target_id: string | null;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ListPlatformAuditQuery {
  platform_user_id?: string;
  action_prefix?: string;
  target_tenant_id?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface ListPlatformAuditResponse {
  items: PlatformAuditItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LoginAsSessionItem {
  id: string;
  platform_user: { id: string; email: string; name: string };
  target_tenant: { id: string; slug: string; name: string };
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  actions_count: number;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface ListLoginAsResponse {
  items: LoginAsSessionItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminAuditQueryService {
  // ─── platform_audit_log feed ───────────────────────────────────────
  async listPlatformAudit(query: ListPlatformAuditQuery): Promise<ListPlatformAuditResponse> {
    const where: Record<string, unknown> = {};
    if (query.platform_user_id) where.platform_user_id = query.platform_user_id;
    if (query.target_tenant_id) where.target_tenant_id = query.target_tenant_id;
    if (query.action_prefix) where.action = { startsWith: query.action_prefix };
    if (query.from || query.to) {
      where.created_at = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      adminPrisma.platformAuditLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      adminPrisma.platformAuditLog.count({ where }),
    ]);

    const userIds = Array.from(new Set(rows.map((r) => r.platform_user_id)));
    const tenantIds = Array.from(
      new Set(rows.map((r) => r.target_tenant_id).filter((id): id is string => Boolean(id))),
    );
    const [users, tenants] = await Promise.all([
      userIds.length
        ? adminPrisma.platformUser.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true },
          })
        : Promise.resolve([]),
      tenantIds.length
        ? adminPrisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, slug: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const items: PlatformAuditItem[] = rows.map((r) => ({
      id: r.id,
      platform_user: userById.get(r.platform_user_id) ?? {
        id: r.platform_user_id,
        email: "(deleted)",
        name: "(deleted)",
      },
      action: r.action,
      target_tenant: r.target_tenant_id ? tenantById.get(r.target_tenant_id) ?? null : null,
      target_entity: r.target_entity,
      target_id: r.target_id,
      reason: r.reason,
      ip: r.ip,
      user_agent: r.user_agent,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      created_at: r.created_at.toISOString(),
    }));

    return { items, total, page: query.page, limit: query.limit };
  }

  // ─── login-as session feed ─────────────────────────────────────────
  /**
   * Materialize impersonation sessions by pairing `impersonation_started`
   * and `impersonation_ended` rows in `platform_audit_log`. Sessions without
   * a matching `_ended` are open. Counts of in-session actions come from
   * `audit_log` rows whose `impersonator_id` matches.
   */
  async listLoginAsSessions(query: {
    platform_user_id?: string;
    target_tenant_id?: string;
    page: number;
    limit: number;
  }): Promise<ListLoginAsResponse> {
    const where: Record<string, unknown> = { action: "impersonation_started" };
    if (query.platform_user_id) where.platform_user_id = query.platform_user_id;
    if (query.target_tenant_id) where.target_tenant_id = query.target_tenant_id;

    const [started, total] = await Promise.all([
      adminPrisma.platformAuditLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      adminPrisma.platformAuditLog.count({ where }),
    ]);

    const userIds = Array.from(new Set(started.map((r) => r.platform_user_id)));
    const tenantIds = Array.from(
      new Set(started.map((r) => r.target_tenant_id).filter((id): id is string => Boolean(id))),
    );
    const [users, tenants] = await Promise.all([
      userIds.length
        ? adminPrisma.platformUser.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true },
          })
        : Promise.resolve([]),
      tenantIds.length
        ? adminPrisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, slug: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    // For each started session, find the matching _ended row by jti in metadata
    // and the count of audit_log rows tagged with impersonator_id between the two timestamps.
    const items = await Promise.all(
      started.map(async (s): Promise<LoginAsSessionItem> => {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        const jti = typeof meta.jti === "string" ? meta.jti : null;

        const ended = jti
          ? await adminPrisma.platformAuditLog.findFirst({
              where: {
                action: "impersonation_ended",
                platform_user_id: s.platform_user_id,
                metadata: { path: ["jti"], equals: jti },
              },
              orderBy: { created_at: "desc" },
            })
          : null;

        const startedAt = s.created_at;
        const endedAt = ended?.created_at ?? null;
        const durationSeconds = endedAt
          ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
          : null;

        const actionsCount = s.target_tenant_id
          ? await adminPrisma.auditLog.count({
              where: {
                tenant_id: s.target_tenant_id,
                impersonator_id: s.platform_user_id,
                created_at: {
                  gte: startedAt,
                  ...(endedAt ? { lte: endedAt } : {}),
                },
              },
            })
          : 0;

        return {
          id: s.id,
          platform_user: userById.get(s.platform_user_id) ?? {
            id: s.platform_user_id,
            email: "(deleted)",
            name: "(deleted)",
          },
          target_tenant: s.target_tenant_id ? tenantById.get(s.target_tenant_id) ?? {
            id: s.target_tenant_id,
            slug: "(deleted)",
            name: "(deleted)",
          } : { id: "", slug: "", name: "(unknown)" },
          started_at: startedAt.toISOString(),
          ended_at: endedAt?.toISOString() ?? null,
          duration_seconds: durationSeconds,
          actions_count: actionsCount,
          reason: s.reason,
          ip: s.ip,
          user_agent: s.user_agent,
        };
      }),
    );

    return { items, total, page: query.page, limit: query.limit };
  }
}
