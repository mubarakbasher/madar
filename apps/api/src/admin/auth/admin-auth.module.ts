import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminMfaGuard } from "./admin-mfa.guard";
import { AdminMfaService } from "./admin-mfa.service";
import { AdminTokenService } from "./admin-token.service";

/**
 * Admin-realm auth module. Wires the AdminAuthController + services.
 *
 * IMPORTANT: AdminAuthGuard is NOT registered as APP_GUARD — the tenant module
 * already owns that slot via TenantAuthGuard. Admin auth applies its guard
 * per-route via @UseGuards(AdminAuthGuard) on protected endpoints.
 *
 * The realm boundary is held in two places:
 *   1. TenantAuthGuard skips paths starting with /v1/admin/ (see
 *      apps/api/src/tenant/auth/tenant-auth.guard.ts).
 *   2. AdminAuthGuard verifies tokens with JWT_ADMIN_SECRET + realm:"admin".
 *      A cross-realm token (signed with the tenant secret) fails signature
 *      verification regardless of claim shape.
 */
@Module({
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminTokenService,
    AdminMfaService,
    AdminAuditService,
    AdminAuthGuard,
    AdminMfaGuard,
  ],
  exports: [AdminTokenService, AdminMfaService, AdminAuditService, AdminAuthGuard],
})
export class AdminAuthModule {}
