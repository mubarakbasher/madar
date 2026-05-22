import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { TokenService } from "./token.service";

export interface TenantMfaPendingPrincipal {
  userId: string;
  tenantId: string;
  jti: string;
}

export const CurrentMfaChallenger = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantMfaPendingPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { tenant_mfa?: TenantMfaPendingPrincipal }>();
    return req.tenant_mfa;
  },
);

/**
 * Used only by POST /v1/auth/mfa/verify. Expects a short-lived mfa_pending
 * token in the Authorization header — typ:"mfa_pending", realm:"tenant".
 * Mirrors AdminMfaGuard (apps/api/src/admin/auth/admin-mfa.guard.ts) for
 * realm consistency.
 */
@Injectable()
export class TenantMfaGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: "mfa_pending_missing",
        message: "MFA challenge token missing",
      });
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = this.tokens.verifyMfaPending(token);
    const alive = await this.tokens.isMfaPendingAlive(claims.jti);
    if (!alive) {
      throw new UnauthorizedException({
        code: "mfa_pending_invalid",
        message: "MFA challenge token already used or expired",
      });
    }
    const principal: TenantMfaPendingPrincipal = {
      userId: claims.user_id,
      tenantId: claims.tenant_id,
      jti: claims.jti,
    };
    (req as Request & { tenant_mfa?: TenantMfaPendingPrincipal }).tenant_mfa = principal;
    return true;
  }
}
