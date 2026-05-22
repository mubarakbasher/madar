import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { AuditService } from "./audit.service";
import { TenantAuthGuard } from "./tenant-auth.guard";
import { TenantMfaGuard } from "./tenant-mfa.guard";
import { MfaService } from "./mfa.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuditService,
    MfaService,
    TenantMfaGuard,
    {
      provide: APP_GUARD,
      useClass: TenantAuthGuard,
    },
  ],
  exports: [TokenService, AuthService, AuditService, MfaService, TenantMfaGuard],
})
export class AuthModule {}
