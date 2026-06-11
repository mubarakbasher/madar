import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { adminPrisma } from "@madar/db";
import { TokenService } from "../../tenant/auth/token.service";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import { RedisService } from "../../common/redis.service";
import type { AdminPrincipal } from "../auth/current-admin.decorator";

// CLAUDE.md: impersonation is gated to a small set of platform roles. Finance
// and developer/readonly are blocked.
const IMPERSONATION_ROLES = new Set<string>(["owner", "support"]);

// The handoff code is the only thing that crosses apps (in the URL the admin
// app opens). It is single-use, expires fast, and exchanges for the JWT via
// POST — the JWT itself never lands in URLs, browser history, or access logs.
const HANDOFF_CODE_TTL_SECONDS = 60;

export interface ImpersonationResponse {
  handoff_code: string;
  expires_at: string;
  expires_in: number;
  jti: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

export interface ImpersonationExchangeResponse {
  access_token: string;
  expires_at: string;
  expires_in: number;
  impersonator_email: string;
  target_tenant: { id: string; slug: string; name: string };
  target_user: { id: string; email: string; name: string; role: string };
}

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly tokens: TokenService,
    private readonly audit: AdminAuditService,
    private readonly redis: RedisService,
  ) {}

  private handoffKey(code: string): string {
    return `imper-code:${code}`;
  }

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

    // CLAUDE.md mandate: impersonation writes to BOTH audit logs. The tenant
    // copy makes the session visible to the tenant's own audit trail, not
    // just the platform's.
    await adminPrisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        user_id: targetUser.id,
        action: "impersonation_started",
        entity: "user",
        entity_id: targetUser.id,
        ip: auditCtx.ip,
        user_agent: auditCtx.userAgent,
        impersonator_id: admin.platformUserId,
        after: {
          impersonator_email: admin.email,
          reason: body.reason,
          jti: token.jti,
          expires_at: token.expires_at,
        },
      },
    });

    // Single-use handoff code instead of the raw JWT — the tenant app
    // exchanges it via POST /v1/auth/impersonation/exchange.
    const code = randomBytes(32).toString("hex");
    const exchangePayload: ImpersonationExchangeResponse = {
      access_token: token.access_token,
      expires_at: token.expires_at,
      expires_in: token.expires_in,
      impersonator_email: admin.email,
      target_tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      target_user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
    };
    await this.redis.setEx(
      this.handoffKey(code),
      JSON.stringify(exchangePayload),
      HANDOFF_CODE_TTL_SECONDS,
    );

    return {
      handoff_code: code,
      expires_at: token.expires_at,
      expires_in: token.expires_in,
      jti: token.jti,
      target_tenant: exchangePayload.target_tenant,
      target_user: exchangePayload.target_user,
    };
  }

  /**
   * Swap a one-time handoff code for the impersonation JWT + context.
   * Unauthenticated by design (the code IS the credential): single-use via
   * atomic GETDEL, 60s TTL, 64 hex chars of entropy.
   */
  async exchange(code: string): Promise<ImpersonationExchangeResponse> {
    if (!/^[0-9a-f]{64}$/i.test(code)) {
      throw new UnauthorizedException({
        code: "handoff_code_invalid",
        message: "Impersonation code invalid or expired",
      });
    }
    const raw = await this.redis.getDel(this.handoffKey(code));
    if (!raw) {
      throw new UnauthorizedException({
        code: "handoff_code_invalid",
        message: "Impersonation code invalid or expired",
      });
    }
    return JSON.parse(raw) as ImpersonationExchangeResponse;
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
    // Mirror into the tenant's own audit trail (double-logging mandate).
    await adminPrisma.auditLog
      .create({
        data: {
          tenant_id: targetTenantId,
          user_id: null,
          action: "impersonation_ended",
          entity: "tenant",
          entity_id: targetTenantId,
          ip: auditCtx.ip,
          user_agent: auditCtx.userAgent,
          impersonator_id: impersonatorId,
          after: { jti, ended_by: impersonatorId },
        },
      })
      .catch(() => {
        // Exit must still succeed if the tenant-side mirror fails — the
        // platform row above is the authoritative record.
      });
    return { ok: true };
  }
}
