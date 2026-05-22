import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { adminPrisma } from "@madar/db";
import { TokenService, type ImpersonationToken } from "../../tenant/auth/token.service";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import type { AdminPrincipal } from "../auth/current-admin.decorator";

// CLAUDE.md: impersonation is gated to a small set of platform roles. Finance
// and developer/readonly are blocked.
const IMPERSONATION_ROLES = new Set<string>(["owner", "support"]);

export interface ImpersonationResponse {
  access_token: string;
  expires_at: string;
  expires_in: number;
  jti: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly tokens: TokenService,
    private readonly audit: AdminAuditService,
  ) {}

  async start(
    admin: AdminPrincipal,
    tenantId: string,
    body: { user_id: string; reason: string },
    auditCtx: AdminAuditCtx,
  ): Promise<ImpersonationResponse> {
    if (!IMPERSONATION_ROLES.has(admin.role)) {
      throw new ForbiddenException({
        code: "impersonation_forbidden_role",
        message: "Your role cannot start impersonation sessions",
      });
    }

    const tenant = await adminPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    const targetUser = await adminPrisma.user.findUnique({
      where: { id: body.user_id },
    });
    if (!targetUser || targetUser.tenant_id !== tenantId || targetUser.deleted_at) {
      throw new NotFoundException({
        code: "target_user_not_found",
        message: "Target user not found in this tenant",
      });
    }
    if (!targetUser.is_active) {
      throw new ForbiddenException({
        code: "target_user_inactive",
        message: "Cannot impersonate an inactive user",
      });
    }

    const token = await this.tokens.mintImpersonationAccess({
      tenantId,
      targetUserId: targetUser.id,
      targetRole: targetUser.role,
      impersonatorId: admin.platformUserId,
      impersonatorEmail: admin.email,
    });

    await this.audit.write(auditCtx, {
      action: "impersonation_started",
      targetTenantId: tenantId,
      targetEntity: "user",
      targetId: targetUser.id,
      reason: body.reason,
      metadata: {
        target_user_email: targetUser.email,
        jti: token.jti,
        expires_at: token.expires_at,
      },
    });

    return {
      access_token: token.access_token,
      expires_at: token.expires_at,
      expires_in: token.expires_in,
      jti: token.jti,
      target_tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      target_user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
    };
  }

  async exit(
    impersonatorId: string,
    targetTenantId: string,
    jti: string,
    auditCtx: AdminAuditCtx,
  ): Promise<{ ok: true }> {
    await this.tokens.revokeImpersonation(jti);
    await this.audit.write(auditCtx, {
      action: "impersonation_ended",
      targetTenantId,
      reason: "exited by impersonator",
      metadata: { jti, ended_by: impersonatorId },
    });
    return { ok: true };
  }
}
