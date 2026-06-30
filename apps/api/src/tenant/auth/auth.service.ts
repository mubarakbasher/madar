import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import argon2 from "argon2";
import { burnPasswordVerification } from "../../common/timing-safe-auth";
import { createHash, randomBytes } from "node:crypto";
// Pre-auth flows (signup, login lookup, password reset, email verification,
// MFA enrollment) run before a tenant JWT exists, so platform-table reads
// (tenants, users) must go through adminPrisma.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { withAdminTx } from "../../shared/db-tx";
import { AuditService } from "./audit.service";
import { TokenService } from "./token.service";
import { MfaService } from "./mfa.service";
import { EmailService, pickLocale } from "../../common/email/email.service";
import { RedisService } from "../../common/redis.service";
import { loadEnv } from "../../env";
import type { LoginInput } from "./dto/login.dto";
import type { SignupInput } from "./dto/signup.dto";
import { RESERVED_SLUGS } from "./dto/slug-available.dto";
import type { ForgotPasswordInput } from "./dto/forgot-password.dto";
import type { ResetPasswordInput } from "./dto/reset-password.dto";
import type { ResendVerificationInput, VerifyEmailInput } from "./dto/verify-email.dto";
import type { MfaVerifyInput } from "./dto/mfa-verify.dto";
import type { MfaEnrollVerifyInput } from "./dto/mfa-enroll.dto";
import type { MfaDisableInput } from "./dto/mfa-disable.dto";
import type { MfaRegenerateInput } from "./dto/mfa-regenerate.dto";
import type { UpdateProfileInput } from "./dto/update-profile.dto";
import type { ChangePasswordInput } from "./dto/change-password.dto";
import type { ChangeEmailInput } from "./dto/change-email.dto";

const ARGON2_PARAMS = {
  type: 2, // argon2id
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const TRIAL_DAYS = 14;
const ENROLL_REDIS_TTL_SECONDS = 600; // 10min to scan + verify the QR

interface UserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  branch_id: string | null;
  email_verified: boolean;
  mfa_enabled: boolean;
}

interface TenantDto {
  id: string;
  slug: string;
  name: string;
  default_locale: string;
  default_currency_code: string;
  country_code: string;
  status: string;
  trial_ends_at: string | null;
  default_tax_class_id: string | null;
  tax_inclusive_default: boolean;
  plan: { code: string; name_i18n: unknown } | null;
}

export interface AuthResult {
  access_token: string;
  expires_in: number;
  user: UserDto;
  tenant: TenantDto;
  refresh_token: string;
  refresh_expires_in: number;
}

export interface MfaPendingResult {
  requires_mfa: true;
  mfa_pending_token: string;
  expires_in: number;
}

export type LoginResult = AuthResult | MfaPendingResult;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly mfa: MfaService,
    private readonly redis: RedisService,
  ) {}

  // ─── slug availability ─────────────────────────────────────────────
  async slugAvailable(slug: string): Promise<{ available: boolean; reason?: string }> {
    const normalized = slug.toLowerCase();
    if (RESERVED_SLUGS.has(normalized)) {
      return { available: false, reason: "reserved" };
    }
    const existing = await adminPrisma.tenant.findUnique({
      where: { slug: normalized },
      select: { id: true },
    });
    return existing ? { available: false, reason: "taken" } : { available: true };
  }

  // ─── signup ────────────────────────────────────────────────────────
  async signup(input: SignupInput, ctx: { ip: string; userAgent: string }): Promise<AuthResult> {
    if (!loadEnv().SIGNUP_ENABLED) {
      throw new ForbiddenException({
        code: "signup_disabled",
        message: "Registration is currently closed",
      });
    }

    const slug = input.slug.toLowerCase();

    if (RESERVED_SLUGS.has(slug)) {
      throw new ConflictException({ code: "slug_reserved", message: "That shop URL is reserved" });
    }

    const slugTaken = await adminPrisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) {
      throw new ConflictException({ code: "slug_taken", message: "That shop URL is taken" });
    }

    const emailTaken = await adminPrisma.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (emailTaken) {
      throw new ConflictException({
        code: "email_taken",
        message: "An account with this email already exists",
      });
    }

    const password_hash = await argon2.hash(input.password, ARGON2_PARAMS);
    const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 86400 * 1000);
    const env = loadEnv();
    const verifyTtlHours = env.EMAIL_VERIFICATION_TTL_HOURS;
    const verifyRawToken = randomBytes(32).toString("hex");
    const verifyTokenHash = sha256Hex(verifyRawToken);
    const verifyExpiresAt = new Date(Date.now() + verifyTtlHours * 3600 * 1000);

    const created = await withAdminTx(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: input.business_name,
          name_i18n: { en: input.business_name, ar: input.business_name },
          country_code: input.country_code,
          default_currency_code: input.default_currency_code ?? "USD",
          default_locale: input.default_locale,
          // plan_id intentionally omitted — tenant picks their plan post-signup
          // via /v1/onboarding/select-plan. Until they pick, TenantAuthGuard
          // returns plan_required for every feature endpoint.
          status: "trialing",
          trial_ends_at,
        },
      });

      const user = await tx.user.create({
        data: {
          tenant_id: tenant.id,
          email: input.email,
          password_hash,
          name: input.owner_name,
          role: "owner",
          locale: input.default_locale,
          is_active: true,
          email_verification_token_hash: verifyTokenHash,
          email_verification_expires_at: verifyExpiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          tenant_id: tenant.id,
          user_id: user.id,
          action: "signup_complete",
          entity: "user",
          entity_id: user.id,
          ip: ctx.ip,
          user_agent: ctx.userAgent,
          after: { slug, plan_code: null, country_code: input.country_code },
        },
      });

      return { tenant, user };
    });

    const tokens = await this.tokens.mintPair({
      userId: created.user.id,
      tenantId: created.tenant.id,
      role: created.user.role,
    });

    // Fire-and-forget welcome + email_verification. Failure logs, doesn't roll back signup.
    const ownerLocale = pickLocale(created.user.locale);
    this.email
      .send({
        template: "welcome",
        to: created.user.email,
        locale: ownerLocale,
        vars: {
          tenantName: created.tenant.name,
          ownerName: created.user.name,
          trialEndsAt: created.tenant.trial_ends_at
            ? created.tenant.trial_ends_at.toISOString().slice(0, 10)
            : "",
          ctaUrl: `${env.TENANT_WEB_ORIGIN}/${ownerLocale}/login`,
        },
      })
      .catch((e) => this.logger.warn(`welcome email send failed: ${(e as Error).message}`));
    this.email
      .send({
        template: "email_verification",
        to: created.user.email,
        locale: ownerLocale,
        vars: {
          userName: created.user.name,
          tenantName: created.tenant.name,
          verifyUrl: `${env.TENANT_WEB_ORIGIN}/${ownerLocale}/verify-email?token=${verifyRawToken}`,
          expiresInHours: verifyTtlHours,
        },
      })
      .catch((e) => this.logger.warn(`verification email send failed: ${(e as Error).message}`));

    return this.toAuthResult(created.user, created.tenant, null, tokens);
  }

  // ─── login ─────────────────────────────────────────────────────────
  async login(input: LoginInput, ctx: { ip: string; userAgent: string }): Promise<LoginResult> {
    let scopedTenantId: string | undefined;
    if (input.tenant_slug) {
      const t = await adminPrisma.tenant.findUnique({
        where: { slug: input.tenant_slug },
        select: { id: true },
      });
      if (!t) {
        throw new UnauthorizedException({
          code: "invalid_credentials",
          message: "Email or password is incorrect",
        });
      }
      scopedTenantId = t.id;
    }

    const candidates = await adminPrisma.user.findMany({
      where: {
        email: input.email,
        deleted_at: null,
        ...(scopedTenantId ? { tenant_id: scopedTenantId } : {}),
      },
    });

    if (candidates.length === 0) {
      await burnPasswordVerification(input.password);
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email or password is incorrect",
      });
    }

    if (candidates.length > 1) {
      throw new ConflictException({
        code: "tenant_slug_required",
        message: "Multiple shops use this email — include tenant_slug",
      });
    }

    const user = candidates[0]!;
    const tenant = await adminPrisma.tenant.findUniqueOrThrow({
      where: { id: user.tenant_id },
      include: { plan: true },
    });

    // A suspended/cancelled tenant is read-only, NOT locked out: the owner
    // must be able to log in, reach Billing, and upload a payment receipt to
    // reactivate (TenantAuthGuard enforces read-only + the /v1/payment-proofs
    // allowlist). Blocking login here would deadlock self-service recovery.
    // The read-only state is recorded on the login_success audit entry below.

    if (!user.is_active) {
      throw new ForbiddenException({
        code: "inactive",
        message: "This account is disabled. Contact your owner.",
      });
    }

    const ok = await argon2.verify(user.password_hash, input.password);
    if (!ok) {
      await this.audit
        .writeTenantScoped(
          { tenantId: tenant.id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          {
            action: "login_failure",
            entity: "user",
            entityId: user.id,
            after: { reason: "bad_password" },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email or password is incorrect",
      });
    }

    // MFA branch — defer minting the access pair until the user completes the
    // second factor. Issue a short-lived mfa_pending JWT instead.
    if (user.mfa_enabled) {
      const mfa = await this.tokens.mintMfaPending({ userId: user.id, tenantId: tenant.id });
      await this.audit
        .writeTenantScoped(
          { tenantId: tenant.id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          { action: "login_mfa_pending", entity: "user", entityId: user.id },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      return {
        requires_mfa: true,
        mfa_pending_token: mfa.token,
        expires_in: mfa.expires_in,
      };
    }

    const tokens = await this.tokens.mintPair({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    await this.audit
      .writeTenantScoped(
        { tenantId: tenant.id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        {
          action: "login_success",
          entity: "user",
          entityId: user.id,
          after: { remember: input.remember, tenant_status: tenant.status },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toAuthResult(user, tenant, tenant.plan, tokens);
  }

  // ─── refresh ───────────────────────────────────────────────────────
  async refresh(refreshToken: string, ctx: { ip: string; userAgent: string }): Promise<AuthResult> {
    const claims = this.tokens.verifyRefresh(refreshToken);

    const alive = await this.tokens.isRefreshAlive(claims.user_id, claims.jti);
    if (!alive) {
      await this.tokens.revokeRefreshFamily(claims.user_id);
      throw new UnauthorizedException({
        code: "refresh_replayed",
        message: "Refresh token already used or revoked",
      });
    }

    const user = await tenantScoped(claims.tenant_id).user.findUnique({
      where: { id: claims.user_id },
    });
    if (!user || !user.is_active || user.deleted_at) {
      await this.tokens.revokeRefresh(claims.user_id, claims.jti);
      throw new UnauthorizedException({
        code: "refresh_user_inactive",
        message: "Account is no longer active",
      });
    }

    const tenant = await adminPrisma.tenant.findUniqueOrThrow({
      where: { id: claims.tenant_id },
      include: { plan: true },
    });
    // Suspended/cancelled tenants keep a valid (read-only) session so they can
    // pay their way back — mirrors login(). The guard, not refresh, enforces
    // read-only. Do not revoke or block here.

    await this.tokens.revokeRefresh(claims.user_id, claims.jti);
    const tokens = await this.tokens.mintPair({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    await this.audit
      .writeTenantScoped(
        { tenantId: tenant.id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        {
          action: "refresh_token_rotated",
          entity: "user",
          entityId: user.id,
          after: { jti_old: claims.jti, jti_new: tokens.refresh_jti },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toAuthResult(user, tenant, tenant.plan, tokens);
  }

  // ─── logout ────────────────────────────────────────────────────────
  async logout(p: {
    userId: string;
    tenantId: string;
    refreshJti?: string;
    ip: string;
    userAgent: string;
  }): Promise<void> {
    if (p.refreshJti) {
      await this.tokens.revokeRefresh(p.userId, p.refreshJti);
    }
    await this.audit
      .writeTenantScoped(
        { tenantId: p.tenantId, userId: p.userId, ip: p.ip, userAgent: p.userAgent },
        { action: "logout", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  // ─── me ────────────────────────────────────────────────────────────
  async me(p: { userId: string; tenantId: string }): Promise<Omit<AuthResult, "access_token" | "expires_in" | "refresh_token" | "refresh_expires_in">> {
    const user = await tenantScoped(p.tenantId).user.findUniqueOrThrow({
      where: { id: p.userId },
    });
    const tenant = await adminPrisma.tenant.findUniqueOrThrow({
      where: { id: p.tenantId },
      include: { plan: true },
    });
    return {
      user: this.toUserDto(user),
      tenant: this.toTenantDto(tenant, tenant.plan),
    };
  }

  // ─── forgot password ───────────────────────────────────────────────
  async forgotPassword(input: ForgotPasswordInput, ctx: { ip: string; userAgent: string }): Promise<void> {
    const env = loadEnv();
    const ttlHours = env.PASSWORD_RESET_TTL_HOURS;

    // Look up via adminPrisma — there's no tenant context until we find the user.
    const user = await adminPrisma.user.findFirst({
      where: { email: input.email, deleted_at: null, is_active: true },
    });
    if (!user) {
      // Neutral 200 to avoid leaking account existence. Done.
      return;
    }
    const tenant = await adminPrisma.tenant.findUnique({ where: { id: user.tenant_id } });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await adminPrisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: expiresAt,
      },
    });

    const locale = pickLocale(input.locale ?? user.locale);
    this.email
      .send({
        template: "password_reset",
        to: user.email,
        locale,
        vars: {
          userName: user.name,
          tenantName: tenant?.name ?? "your shop",
          resetUrl: `${env.TENANT_WEB_ORIGIN}/${locale}/reset-password?token=${rawToken}`,
          expiresInHours: ttlHours,
        },
      })
      .catch((e) => this.logger.warn(`password_reset email failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(
        { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "password_reset_requested", entity: "user", entityId: user.id },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  async resetPassword(input: ResetPasswordInput, ctx: { ip: string; userAgent: string }): Promise<void> {
    const tokenHash = sha256Hex(input.token);
    const user = await adminPrisma.user.findFirst({
      where: { password_reset_token_hash: tokenHash, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException({ code: "invalid_token", message: "This reset link is invalid" });
    }
    if (!user.password_reset_expires_at || user.password_reset_expires_at.getTime() < Date.now()) {
      throw new GoneException({ code: "reset_token_expired", message: "This reset link has expired" });
    }

    const newHash = await argon2.hash(input.new_password, ARGON2_PARAMS);
    await adminPrisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newHash,
        password_reset_token_hash: null,
        password_reset_expires_at: null,
      },
    });

    // Invalidate every active session so stolen cookies become useless.
    await this.tokens.revokeAllRefreshTokensForUser(user.id);

    await this.audit
      .writeTenantScoped(
        { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "password_reset_completed", entity: "user", entityId: user.id },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  // ─── verify email ──────────────────────────────────────────────────
  async verifyEmail(input: VerifyEmailInput, ctx: { ip: string; userAgent: string }): Promise<void> {
    const tokenHash = sha256Hex(input.token);
    const user = await adminPrisma.user.findFirst({
      where: { email_verification_token_hash: tokenHash, deleted_at: null },
    });
    if (!user) {
      // Could be: already verified (token cleared) OR truly bogus. We can't tell.
      // Idempotent semantics: if any user with this email is already verified, return 200.
      throw new NotFoundException({ code: "invalid_token", message: "This verification link is invalid" });
    }
    if (
      !user.email_verification_expires_at ||
      user.email_verification_expires_at.getTime() < Date.now()
    ) {
      throw new GoneException({ code: "verify_token_expired", message: "This verification link has expired" });
    }

    if (user.pending_email) {
      // Confirmed email CHANGE: swap now, and kill every other session —
      // whoever initiated the change should have to sign in again with the
      // new address.
      const oldEmail = user.email;
      await adminPrisma.user.update({
        where: { id: user.id },
        data: {
          email: user.pending_email,
          pending_email: null,
          email_verified: true,
          email_verification_token_hash: null,
          email_verification_expires_at: null,
        },
      });
      await this.tokens.revokeAllRefreshTokensForUser(user.id);
      await this.audit
        .writeTenantScoped(
          { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          {
            action: "email_changed",
            entity: "user",
            entityId: user.id,
            before: { email: oldEmail },
            after: { email: user.pending_email },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      return;
    }

    await adminPrisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
      },
    });

    await this.audit
      .writeTenantScoped(
        { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "email_verified", entity: "user", entityId: user.id },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  async resendVerification(
    input: ResendVerificationInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    const env = loadEnv();
    const ttlHours = env.EMAIL_VERIFICATION_TTL_HOURS;
    const user = await adminPrisma.user.findFirst({
      where: { email: input.email, deleted_at: null, is_active: true, email_verified: false },
    });
    if (!user) return; // neutral 200
    const tenant = await adminPrisma.tenant.findUnique({ where: { id: user.tenant_id } });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await adminPrisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token_hash: tokenHash,
        email_verification_expires_at: expiresAt,
      },
    });

    const locale = pickLocale(input.locale ?? user.locale);
    this.email
      .send({
        template: "email_verification",
        to: user.email,
        locale,
        vars: {
          userName: user.name,
          tenantName: tenant?.name ?? "your shop",
          verifyUrl: `${env.TENANT_WEB_ORIGIN}/${locale}/verify-email?token=${rawToken}`,
          expiresInHours: ttlHours,
        },
      })
      .catch((e) => this.logger.warn(`email_verification send failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(
        { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "email_verification_resent", entity: "user", entityId: user.id },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  // ─── MFA verify (login second step) ─────────────────────────────────
  async mfaVerify(
    p: { userId: string; tenantId: string; jti: string },
    input: MfaVerifyInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<AuthResult> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user || user.deleted_at || !user.is_active) {
      throw new UnauthorizedException({ code: "mfa_pending_invalid", message: "Session no longer valid" });
    }
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: user.tenant_id },
      include: { plan: true },
    });
    if (!tenant) {
      throw new UnauthorizedException({ code: "mfa_pending_invalid", message: "Session no longer valid" });
    }
    if (!user.mfa_enabled || !user.mfa_secret) {
      throw new UnauthorizedException({ code: "mfa_not_enabled", message: "MFA is not enabled on this account" });
    }

    const code = input.code;
    let ok = false;
    let usedRecovery = false;
    let recoveryIndex = -1;

    if (this.mfa.isRecoveryCode(code)) {
      recoveryIndex = await this.mfa.findRecoveryCodeIndex(code, user.mfa_recovery_codes_hash);
      ok = recoveryIndex !== -1;
      usedRecovery = ok;
    } else {
      ok = this.mfa.verifyTotp(code, user.mfa_secret);
    }

    if (!ok) {
      await this.audit
        .writeTenantScoped(
          { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
          { action: "mfa_verify_failure", entity: "user", entityId: user.id },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      throw new UnauthorizedException({ code: "mfa_invalid", message: "Code is incorrect" });
    }

    // Consume the mfa_pending jti — second attempt with the same token fails.
    await this.tokens.consumeMfaPending(p.jti);

    if (usedRecovery && recoveryIndex !== -1) {
      const next = [...user.mfa_recovery_codes_hash];
      next.splice(recoveryIndex, 1);
      await adminPrisma.user.update({
        where: { id: user.id },
        data: { mfa_recovery_codes_hash: next },
      });
    }

    const tokens = await this.tokens.mintPair({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

    await this.audit
      .writeTenantScoped(
        { tenantId: user.tenant_id, userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
        {
          action: "mfa_verify_success",
          entity: "user",
          entityId: user.id,
          after: { method: usedRecovery ? "recovery_code" : "totp" },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toAuthResult(user, tenant, tenant.plan, tokens);
  }

  // ─── MFA enrollment ────────────────────────────────────────────────
  async mfaEnrollStart(
    p: { userId: string; tenantId: string },
    ctx: { ip: string; userAgent: string },
  ): Promise<{ provisioning_uri: string; secret_b32: string }> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user) {
      throw new NotFoundException({ code: "user_not_found", message: "User not found" });
    }
    if (user.mfa_enabled) {
      throw new ConflictException({
        code: "mfa_already_enabled",
        message: "Two-factor authentication is already on for this account",
      });
    }
    const secret = this.mfa.generateSecret();
    const tenant = await adminPrisma.tenant.findUnique({ where: { id: p.tenantId } });
    const provisioning = this.mfa.keyUri({
      secret,
      label: user.email,
      issuer: `Madar${tenant ? ` (${tenant.name})` : ""}`,
    });
    // Hold the candidate secret in Redis until enroll/verify completes.
    await this.redis.setEx(this.enrollKey(user.id), secret, ENROLL_REDIS_TTL_SECONDS);

    await this.audit
      .writeTenantScoped(
        { tenantId: p.tenantId, userId: p.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "mfa_enroll_started", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { provisioning_uri: provisioning, secret_b32: secret };
  }

  async mfaEnrollVerify(
    p: { userId: string; tenantId: string },
    input: MfaEnrollVerifyInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<{ recovery_codes: string[] }> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user) {
      throw new NotFoundException({ code: "user_not_found", message: "User not found" });
    }
    if (user.mfa_enabled) {
      throw new ConflictException({
        code: "mfa_already_enabled",
        message: "Two-factor authentication is already on for this account",
      });
    }
    const candidate = await this.redis.get(this.enrollKey(p.userId));
    if (!candidate) {
      throw new GoneException({
        code: "enroll_expired",
        message: "Enrollment session expired — start again from Settings",
      });
    }
    if (!this.mfa.verifyTotp(input.code, candidate)) {
      throw new UnauthorizedException({ code: "mfa_invalid", message: "Code is incorrect" });
    }

    const codes = this.mfa.generateRecoveryCodes(10);
    const hashes = await this.mfa.hashRecoveryCodes(codes);

    await adminPrisma.user.update({
      where: { id: p.userId },
      data: {
        mfa_secret: candidate,
        mfa_enabled: true,
        mfa_recovery_codes_hash: hashes,
      },
    });
    await this.redis.del(this.enrollKey(p.userId));

    await this.audit
      .writeTenantScoped(
        { tenantId: p.tenantId, userId: p.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "mfa_enabled", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { recovery_codes: codes };
  }

  async mfaDisable(
    p: { userId: string; tenantId: string },
    input: MfaDisableInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user) {
      throw new NotFoundException({ code: "user_not_found", message: "User not found" });
    }
    if (!user.mfa_enabled) {
      throw new ConflictException({ code: "mfa_not_enabled", message: "Two-factor authentication is not on" });
    }
    const ok = await argon2.verify(user.password_hash, input.password);
    if (!ok) {
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Password is incorrect" });
    }
    await adminPrisma.user.update({
      where: { id: p.userId },
      data: {
        mfa_enabled: false,
        mfa_secret: null,
        mfa_recovery_codes_hash: [],
      },
    });
    await this.audit
      .writeTenantScoped(
        { tenantId: p.tenantId, userId: p.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "mfa_disabled", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  /**
   * Regenerate the 10 single-use MFA recovery codes for an enrolled user.
   * Old codes are invalidated atomically with the new set being saved — there
   * is no window during which both work. Password re-entry is required so a
   * stolen session can't silently rotate the codes to lock the owner out.
   */
  async mfaRegenerateRecoveryCodes(
    p: { userId: string; tenantId: string },
    input: MfaRegenerateInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<{ recovery_codes: string[] }> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user) {
      throw new NotFoundException({ code: "user_not_found", message: "User not found" });
    }
    if (!user.mfa_enabled) {
      throw new ConflictException({
        code: "mfa_not_enabled",
        message: "Enable two-factor authentication before generating recovery codes",
      });
    }
    const ok = await argon2.verify(user.password_hash, input.password);
    if (!ok) {
      throw new UnauthorizedException({ code: "invalid_credentials", message: "Password is incorrect" });
    }

    const codes = this.mfa.generateRecoveryCodes(10);
    const hashes = await this.mfa.hashRecoveryCodes(codes);

    await adminPrisma.user.update({
      where: { id: p.userId },
      data: { mfa_recovery_codes_hash: hashes },
    });

    await this.audit
      .writeTenantScoped(
        { tenantId: p.tenantId, userId: p.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "mfa_recovery_codes_regenerated", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return { recovery_codes: codes };
  }

  // ─── helpers ───────────────────────────────────────────────────────
  private enrollKey(userId: string): string {
    return `mfa-enroll:${userId}`;
  }

  private toAuthResult(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      locale: string;
      branch_id: string | null;
      email_verified: boolean;
      mfa_enabled: boolean;
    },
    tenant: {
      id: string;
      slug: string;
      name: string;
      default_locale: string;
      default_currency_code: string;
      country_code: string;
      status: string;
      trial_ends_at: Date | null;
    },
    plan: { code: string; name_i18n: unknown } | null,
    tokens: Awaited<ReturnType<TokenService["mintPair"]>>,
  ): AuthResult {
    return {
      access_token: tokens.access_token,
      expires_in: tokens.access_expires_in,
      refresh_token: tokens.refresh_token,
      refresh_expires_in: tokens.refresh_expires_in,
      user: this.toUserDto(user),
      tenant: this.toTenantDto(tenant, plan),
    };
  }

  // ─── self-service profile (§45) ────────────────────────────────────

  async updateProfile(
    p: { userId: string; tenantId: string; impersonatorId?: string },
    input: UpdateProfileInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<Omit<AuthResult, "access_token" | "expires_in" | "refresh_token" | "refresh_expires_in">> {
    const scoped = tenantScoped(p.tenantId);
    const before = await scoped.user.findUniqueOrThrow({ where: { id: p.userId } });

    const data: { name?: string; locale?: string } = {};
    if (input.name !== undefined && input.name !== before.name) data.name = input.name;
    if (input.locale !== undefined && input.locale !== before.locale) data.locale = input.locale;

    const updated =
      Object.keys(data).length > 0
        ? await scoped.user.update({ where: { id: p.userId }, data })
        : before;

    if (Object.keys(data).length > 0) {
      await this.audit
        .writeTenantScoped(
          {
            tenantId: p.tenantId,
            userId: p.userId,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            ...(p.impersonatorId ? { impersonatorId: p.impersonatorId } : {}),
          },
          {
            action: "profile_updated",
            entity: "user",
            entityId: p.userId,
            before: {
              ...("name" in data ? { name: before.name } : {}),
              ...("locale" in data ? { locale: before.locale } : {}),
            },
            after: { ...data },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    const tenant = await adminPrisma.tenant.findUniqueOrThrow({
      where: { id: p.tenantId },
      include: { plan: true },
    });
    return {
      user: this.toUserDto(updated),
      tenant: this.toTenantDto(tenant, tenant.plan),
    };
  }

  async changePassword(
    p: { userId: string; tenantId: string; impersonatorId?: string },
    input: ChangePasswordInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user || user.deleted_at) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Wrong password",
      });
    }
    const ok = await argon2.verify(user.password_hash, input.current_password);
    if (!ok) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Wrong password",
      });
    }
    const sameAsOld = await argon2.verify(user.password_hash, input.new_password);
    if (sameAsOld) {
      throw new BadRequestException({
        code: "same_password",
        message: "New password must differ from the current one",
      });
    }

    const newHash = await argon2.hash(input.new_password, ARGON2_PARAMS);
    await adminPrisma.user.update({
      where: { id: user.id },
      data: { password_hash: newHash },
    });

    // Invalidate every active refresh token — same defence as reset-password.
    await this.tokens.revokeAllRefreshTokensForUser(user.id);

    await this.audit
      .writeTenantScoped(
        {
          tenantId: p.tenantId,
          userId: p.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(p.impersonatorId ? { impersonatorId: p.impersonatorId } : {}),
        },
        { action: "password_changed", entity: "user", entityId: p.userId },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  async changeEmail(
    p: { userId: string; tenantId: string; impersonatorId?: string },
    input: ChangeEmailInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    const env = loadEnv();
    const ttlHours = env.EMAIL_VERIFICATION_TTL_HOURS;

    const user = await adminPrisma.user.findUnique({ where: { id: p.userId } });
    if (!user || user.deleted_at) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Wrong password",
      });
    }
    const ok = await argon2.verify(user.password_hash, input.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Wrong password",
      });
    }
    if (input.new_email === user.email) {
      throw new BadRequestException({
        code: "same_email",
        message: "New email must differ from the current one",
      });
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    // STAGED change: the login email is untouched until the NEW address
    // proves it can receive mail (token consumed in verifyEmail). Swapping
    // immediately would let a hijacked session silently take over the
    // account — password resets would start going to the attacker.
    const emailTaken = await adminPrisma.user.findFirst({
      where: { tenant_id: user.tenant_id, email: input.new_email, deleted_at: null },
      select: { id: true },
    });
    if (emailTaken) {
      throw new ConflictException({
        code: "email_taken",
        message: "Another user already has this email",
      });
    }

    await adminPrisma.user.update({
      where: { id: user.id },
      data: {
        pending_email: input.new_email,
        email_verification_token_hash: tokenHash,
        email_verification_expires_at: expiresAt,
      },
    });

    const tenant = await adminPrisma.tenant.findUnique({ where: { id: user.tenant_id } });
    const locale = pickLocale(user.locale);
    this.email
      .send({
        template: "email_verification",
        to: input.new_email,
        locale,
        vars: {
          userName: user.name,
          tenantName: tenant?.name ?? "your shop",
          verifyUrl: `${env.TENANT_WEB_ORIGIN}/${locale}/verify-email?token=${rawToken}`,
          expiresInHours: ttlHours,
        },
      })
      .catch((e) => this.logger.warn(`email_verification send failed: ${(e as Error).message}`));

    // Heads-up to the OLD address so the real owner notices a hijack attempt
    // while their login still works.
    this.email
      .sendRaw({
        to: user.email,
        subject: "Your Madar sign-in email is being changed",
        html: `<p>Hi ${user.name},</p><p>A request was made to change your Madar sign-in email to <strong>${input.new_email}</strong>. Nothing changes until that address confirms.</p><p>If this wasn't you, change your password immediately — your current email keeps working until the new one is confirmed.</p>`,
      })
      .catch((e) => this.logger.warn(`email-change notice send failed: ${(e as Error).message}`));

    await this.audit
      .writeTenantScoped(
        {
          tenantId: p.tenantId,
          userId: p.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(p.impersonatorId ? { impersonatorId: p.impersonatorId } : {}),
        },
        {
          action: "email_change_requested",
          entity: "user",
          entityId: p.userId,
          before: { email: user.email },
          after: { pending_email: input.new_email },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
  }

  private toUserDto(u: {
    id: string;
    email: string;
    name: string;
    role: string;
    locale: string;
    branch_id: string | null;
    email_verified: boolean;
    mfa_enabled: boolean;
  }): UserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      locale: u.locale,
      branch_id: u.branch_id,
      email_verified: u.email_verified,
      mfa_enabled: u.mfa_enabled,
    };
  }

  private toTenantDto(
    t: {
      id: string;
      slug: string;
      name: string;
      default_locale: string;
      default_currency_code: string;
      country_code: string;
      status: string;
      trial_ends_at: Date | null;
      default_tax_class_id?: string | null;
      tax_inclusive_default?: boolean | null;
    },
    plan: { code: string; name_i18n: unknown } | null,
  ): TenantDto {
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      default_locale: t.default_locale,
      default_currency_code: t.default_currency_code,
      country_code: t.country_code,
      status: t.status,
      trial_ends_at: t.trial_ends_at?.toISOString() ?? null,
      default_tax_class_id: t.default_tax_class_id ?? null,
      tax_inclusive_default: Boolean(t.tax_inclusive_default),
      plan: plan ? { code: plan.code, name_i18n: plan.name_i18n } : null,
    };
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
