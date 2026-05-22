import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "./admin-token.service";
import type { AdminMfaPendingPrincipal } from "./current-admin.decorator";

/**
 * Used only by POST /v1/admin/auth/mfa/verify. Expects a short-lived
 * mfa_pending token in the Authorization header — typ:"mfa_pending", realm:"admin".
 */
@Injectable()
export class AdminMfaGuard implements CanActivate {
  constructor(private readonly tokens: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
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

    const principal: AdminMfaPendingPrincipal = {
      platformUserId: claims.platform_user_id,
      email: claims.email,
    };
    (req as Request & { admin_mfa?: AdminMfaPendingPrincipal }).admin_mfa = principal;
    return true;
  }
}
