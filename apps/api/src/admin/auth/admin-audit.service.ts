import { Injectable } from "@nestjs/common";
import { adminPrisma } from "@madar/db";

export interface AdminAuditCtx {
  platformUserId: string;
  ip: string;
  userAgent: string;
}

export interface AdminAuditEvent {
  action: string;
  targetTenantId?: string;
  targetEntity?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes to platform_audit_log via adminPrisma (RLS bypassed — platform tables
 * are not tenant-scoped, but the adminPrisma client is also the canonical way
 * to reach them from API code per CLAUDE.md).
 */
@Injectable()
export class AdminAuditService {
  async write(ctx: AdminAuditCtx, evt: AdminAuditEvent): Promise<void> {
    await adminPrisma.platformAuditLog.create({
      data: {
        platform_user_id: ctx.platformUserId,
        action: evt.action,
        ...(evt.targetTenantId ? { target_tenant_id: evt.targetTenantId } : {}),
        ...(evt.targetEntity ? { target_entity: evt.targetEntity } : {}),
        ...(evt.targetId ? { target_id: evt.targetId } : {}),
        ...(evt.reason ? { reason: evt.reason } : {}),
        ip: ctx.ip,
        user_agent: ctx.userAgent,
        ...(evt.metadata ? { metadata: evt.metadata as object } : {}),
      },
    });
  }
}
