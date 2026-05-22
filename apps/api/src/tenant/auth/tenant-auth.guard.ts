import { CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { TokenService } from "./token.service";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { RedisService } from "../../common/redis.service";
import { getTenantStatus } from "./tenant-status.cache";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Paths that remain reachable when a tenant is `suspended` or `cancelled`.
 * The tenant still needs to log out, refresh the session, look up /me, and
 * pay an outstanding subscription invoice via the payment-proof flow.
 */
const STATUS_ALLOWED_WRITE_PREFIXES = [
  "/v1/auth/logout",
  "/v1/auth/refresh",
  "/v1/payment-proofs",
  "/v1/impersonation/exit",
];

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Admin-realm routes are owned by AdminAuthGuard (applied per-route in
    // apps/api/src/admin/auth/admin-auth.controller.ts). The tenant guard
    // must not run on them — it would reject every admin request including
    // the admin login itself.
    if (req.path.startsWith("/v1/admin/")) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: "access_missing",
        message: "Authorization header missing",
      });
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = this.tokens.verifyAccess(token);

    // Impersonation tokens get revoked on exit — verify the jti is still alive
    // in Redis. This is the only way to invalidate an unexpired JWT.
    if (claims.impersonator_id) {
      const alive = await this.tokens.isImpersonationAlive(claims.jti);
      if (!alive) {
        throw new UnauthorizedException({
          code: "impersonation_revoked",
          message: "This impersonation session has ended",
        });
      }
    }

    req.user = {
      userId: claims.user_id,
      tenantId: claims.tenant_id,
      role: claims.role,
      jti: claims.jti,
      ...(claims.impersonator_id ? { impersonatorId: claims.impersonator_id } : {}),
      ...(claims.impersonator_email ? { impersonatorEmail: claims.impersonator_email } : {}),
    };

    // Subscription-status gate: suspended/cancelled tenants are read-only.
    // Reads stay open so the tenant can export data + pay. Mutations are
    // blocked except for the small allowlist (logout, refresh, payment-proof
    // submission for subscription invoices, impersonation exit).
    if (WRITE_METHODS.has(req.method.toUpperCase()) && !this.isAllowedWritePath(req.path)) {
      const status = await getTenantStatus(claims.tenant_id, this.redis);
      if (status === "suspended" || status === "cancelled") {
        throw new HttpException(
          {
            code: "tenant_suspended",
            message:
              status === "suspended"
                ? "Subscription suspended — pay the outstanding invoice to restore write access."
                : "Account cancelled — export your data within the retention window.",
            status,
          },
          423,
        );
      }
    }

    return true;
  }

  private isAllowedWritePath(path: string): boolean {
    return STATUS_ALLOWED_WRITE_PREFIXES.some((prefix) => path.startsWith(prefix));
  }
}
