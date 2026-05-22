import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AdminTokenService } from "./admin-token.service";
import type { AdminPrincipal } from "./current-admin.decorator";

/**
 * Validates an admin-realm access JWT on the Authorization header.
 *   - realm:"admin", typ:"access"
 *   - signed with JWT_ADMIN_SECRET
 *   - audience madar.admin
 *
 * Not registered as APP_GUARD — applied per-route via @UseGuards on the
 * AdminAuthController. Routes that need it call it explicitly; @Public()-style
 * skipping isn't needed because the controller knows which endpoints require
 * full auth.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly tokens: AdminTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: "admin_access_missing",
        message: "Authorization header missing",
      });
    }
    const token = header.slice("Bearer ".length).trim();
    const claims = this.tokens.verifyAccess(token);

    const principal: AdminPrincipal = {
      platformUserId: claims.platform_user_id,
      email: claims.email,
      role: claims.role,
      jti: claims.jti,
    };
    (req as Request & { admin?: AdminPrincipal }).admin = principal;
    return true;
  }
}
