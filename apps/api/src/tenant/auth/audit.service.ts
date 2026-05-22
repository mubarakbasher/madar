import { Injectable } from "@nestjs/common";
// Bootstrap audit writes happen during signup, before a tenant JWT exists, so
// the row must be written via adminPrisma's RLS bypass inside the signup tx.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";

export interface AuditCtx {
  tenantId: string;
  userId: string | null;
  ip: string;
  userAgent: string;
  /** When set, this row was written during an admin impersonation session. */
  impersonatorId?: string;
}

export interface AuditEvent {
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  /**
   * Write an audit_log row via the tenant-scoped client. Use for events that
   * happen after the tenant is fully resolved (login, logout, refresh, etc.).
   */
  async writeTenantScoped(ctx: AuditCtx, evt: AuditEvent): Promise<void> {
    const client = tenantScoped(ctx.tenantId) as unknown as {
      auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
    };
    await client.auditLog.create({
      data: {
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        ...(ctx.impersonatorId ? { impersonator_id: ctx.impersonatorId } : {}),
        action: evt.action,
        entity: evt.entity,
        entity_id: evt.entityId,
        ...(evt.before !== undefined ? { before: evt.before } : {}),
        ...(evt.after !== undefined ? { after: evt.after } : {}),
        ip: ctx.ip,
        user_agent: ctx.userAgent,
      },
    });
  }

  /**
   * Bootstrap-only: write an audit row using adminPrisma's RLS bypass.
   * Used for signup, where the tenant_id doesn't exist when the controller
   * starts but does by the time the audit row is written inside the transaction.
   */
  async writeAsAdmin(ctx: AuditCtx, evt: AuditEvent): Promise<void> {
    await adminPrisma.auditLog.create({
      data: {
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        action: evt.action,
        entity: evt.entity,
        entity_id: evt.entityId,
        ...(evt.before !== undefined ? { before: evt.before as object } : {}),
        ...(evt.after !== undefined ? { after: evt.after as object } : {}),
        ip: ctx.ip,
        user_agent: ctx.userAgent,
      },
    });
  }
}
