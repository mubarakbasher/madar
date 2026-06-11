import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import argon2 from "argon2";
import { burnPasswordVerification } from "../../common/timing-safe-auth";
import { adminPrisma } from "@madar/db";
import { AdminAuditService } from "./admin-audit.service";
import { AdminMfaService } from "./admin-mfa.service";
import { AdminTokenService } from "./admin-token.service";
import type { AdminLoginInput } from "./dto/admin-login.dto";
import type { MfaVerifyInput } from "./dto/mfa-verify.dto";

interface PlatformUserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  mfa_enabled: boolean;
  last_login_at: string | null;
}

export interface AdminLoginResult {
  mfa_pending_token: string;
  mfa_pending_expires_in: number;
}

export interface AdminAuthResult {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  platform_user: PlatformUserDto;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly tokens: AdminTokenService,
    private readonly mfa: AdminMfaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ─── step 1: password ─────────────────────────────────────────────
  async login(
    input: AdminLoginInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<AdminLoginResult> {
    const user = await adminPrisma.platformUser.findUnique({ where: { email: input.email } });

    if (!user) {
      // No audit (no platform_user_id to attribute to).
      await burnPasswordVerification(input.password);
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email or password is incorrect",
      });
    }

    const ok = await argon2.verify(user.password_hash, input.password);
    if (!ok) {
      await this.audit
        .write(
          { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          { action: "admin_login_password_fail", metadata: { reason: "bad_password" } },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email or password is incorrect",
      });
    }

    if (!user.is_active) {
      await this.audit
        .write(
          { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          { action: "admin_login_blocked_deactivated", metadata: { reason: "account_deactivated" } },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      throw new ForbiddenException({
        code: "account_deactivated",
        message: "Your account has been deactivated. Contact the platform owner.",
      });
    }

    if (!user.mfa_enabled || !user.mfa_secret) {
      // Enrollment lands in a later slice — until then, MFA is the gate.
      throw new ForbiddenException({
        code: "mfa_not_enrolled",
        message: "Multi-factor authentication is required but not yet enrolled",
      });
    }

    const minted = this.tokens.mintMfaPending({ platformUserId: user.id, email: user.email });

    await this.audit
      .write(
        { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "admin_login_password_ok", metadata: { mfa_pending_jti: minted.jti } },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return {
      mfa_pending_token: minted.token,
      mfa_pending_expires_in: minted.expires_in,
    };
  }

  // ─── step 2: MFA verify ───────────────────────────────────────────
  async verifyMfa(
    platformUserId: string,
    input: MfaVerifyInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<AdminAuthResult> {
    const user = await adminPrisma.platformUser.findUnique({ where: { id: platformUserId } });
    if (!user || !user.mfa_secret || !user.mfa_enabled) {
      throw new UnauthorizedException({
        code: "mfa_pending_invalid",
        message: "MFA challenge no longer valid",
      });
    }

    const ok = this.mfa.verify(input.code, user.mfa_secret);
    if (!ok) {
      await this.audit
        .write(
          { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          { action: "admin_login_mfa_fail" },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      throw new UnauthorizedException({
        code: "mfa_invalid",
        message: "Verification code is incorrect",
      });
    }

    const mfaVerifiedAt = Math.floor(Date.now() / 1000);
    const pair = await this.tokens.mintAccessPair({
      platformUserId: user.id,
      email: user.email,
      role: user.role,
      mfaVerifiedAt,
    });

    await adminPrisma.platformUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    await this.audit
      .write(
        { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "admin_login_mfa_ok", metadata: { access_jti: pair.access_jti } },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toAuthResult(user, pair);
  }

  // ─── refresh ──────────────────────────────────────────────────────
  async refresh(refreshToken: string, ctx: { ip: string; userAgent: string }): Promise<AdminAuthResult> {
    const claims = this.tokens.verifyRefresh(refreshToken);

    const alive = await this.tokens.isRefreshAlive(claims.platform_user_id, claims.jti);
    if (!alive) {
      await this.tokens.revokeRefreshFamily(claims.platform_user_id);
      throw new UnauthorizedException({
        code: "admin_refresh_replayed",
        message: "Refresh token already used or revoked",
      });
    }

    const user = await adminPrisma.platformUser.findUnique({ where: { id: claims.platform_user_id } });
    if (!user) {
      await this.tokens.revokeRefresh(claims.platform_user_id, claims.jti);
      throw new UnauthorizedException({
        code: "admin_refresh_user_gone",
        message: "Admin account no longer exists",
      });
    }

    if (!user.is_active) {
      await this.tokens.revokeRefresh(user.id, claims.jti);
      throw new ForbiddenException({
        code: "account_deactivated",
        message: "Your account has been deactivated. Contact the platform owner.",
      });
    }

    await this.tokens.revokeRefresh(user.id, claims.jti);
    const pair = await this.tokens.mintAccessPair({
      platformUserId: user.id,
      email: user.email,
      role: user.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });

    await this.audit
      .write(
        { platformUserId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        {
          action: "admin_token_refreshed",
          metadata: { jti_old: claims.jti, jti_new: pair.refresh_jti },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toAuthResult(user, pair);
  }

  // ─── logout ───────────────────────────────────────────────────────
  async logout(p: {
    platformUserId: string;
    refreshJti?: string;
    ip: string;
    userAgent: string;
  }): Promise<void> {
    if (p.refreshJti) {
      await this.tokens.revokeRefresh(p.platformUserId, p.refreshJti);
    }
    await this.audit
      .write(
        { platformUserId: p.platformUserId, ip: p.ip, userAgent: p.userAgent },
        { action: "admin_logout" },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  // ─── me ───────────────────────────────────────────────────────────
  async me(platformUserId: string): Promise<{ platform_user: PlatformUserDto }> {
    const user = await adminPrisma.platformUser.findUniqueOrThrow({ where: { id: platformUserId } });
    return { platform_user: this.toUserDto(user) };
  }

  // ─── helpers ──────────────────────────────────────────────────────
  private toAuthResult(
    user: { id: string; email: string; name: string; role: string; mfa_enabled: boolean; last_login_at: Date | null },
    pair: Awaited<ReturnType<AdminTokenService["mintAccessPair"]>>,
  ): AdminAuthResult {
    return {
      access_token: pair.access_token,
      expires_in: pair.access_expires_in,
      refresh_token: pair.refresh_token,
      refresh_expires_in: pair.refresh_expires_in,
      platform_user: this.toUserDto(user),
    };
  }

  private toUserDto(u: {
    id: string;
    email: string;
    name: string;
    role: string;
    mfa_enabled: boolean;
    last_login_at: Date | null;
  }): PlatformUserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      mfa_enabled: u.mfa_enabled,
      last_login_at: u.last_login_at?.toISOString() ?? null,
    };
  }
}
