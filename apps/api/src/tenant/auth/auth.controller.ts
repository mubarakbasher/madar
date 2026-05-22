import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { CurrentUser, type TenantPrincipal } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { CurrentMfaChallenger, TenantMfaGuard, type TenantMfaPendingPrincipal } from "./tenant-mfa.guard";
import { assertNotImpersonating } from "./impersonation.helper";
import { LoginSchema, type LoginInput } from "./dto/login.dto";
import { SignupSchema, type SignupInput } from "./dto/signup.dto";
import { SlugAvailableQuerySchema, type SlugAvailableQuery } from "./dto/slug-available.dto";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "./dto/forgot-password.dto";
import { ResetPasswordSchema, type ResetPasswordInput } from "./dto/reset-password.dto";
import {
  ResendVerificationSchema,
  VerifyEmailSchema,
  type ResendVerificationInput,
  type VerifyEmailInput,
} from "./dto/verify-email.dto";
import { MfaVerifySchema, type MfaVerifyInput } from "./dto/mfa-verify.dto";
import { MfaEnrollVerifySchema, type MfaEnrollVerifyInput } from "./dto/mfa-enroll.dto";
import { MfaDisableSchema, type MfaDisableInput } from "./dto/mfa-disable.dto";
import { MfaRegenerateSchema, type MfaRegenerateInput } from "./dto/mfa-regenerate.dto";
import { UpdateProfileSchema, type UpdateProfileInput } from "./dto/update-profile.dto";
import { ChangePasswordSchema, type ChangePasswordInput } from "./dto/change-password.dto";
import { ChangeEmailSchema, type ChangeEmailInput } from "./dto/change-email.dto";

const REFRESH_COOKIE = "madar_refresh";

// Path is intentionally "/" so the same cookie is visible both to /v1/auth/*
// API routes (refresh + logout) AND to the Next.js server-side requireAuth()
// check on /[locale]/* pages. Cookie stays HttpOnly + SameSite=Lax.
function setRefreshCookie(res: Response, token: string, maxAgeSec: number): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

@Controller("v1/auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly tokens: TokenService) {}

  @Get("slug-available")
  @Public()
  @RateLimit({ max: 30, windowMs: 60_000 })
  async slugAvailable(
    @Query(new ZodValidationPipe(SlugAvailableQuerySchema)) q: SlugAvailableQuery,
  ) {
    return this.auth.slugAvailable(q.slug);
  }

  @Post("signup")
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 5, windowMs: 60 * 60 * 1000 })
  async signup(
    @Body(new ZodValidationPipe(SignupSchema)) body: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.signup(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    setRefreshCookie(res, result.refresh_token, result.refresh_expires_in);
    return this.toResponse(result);
  }

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000, keyByField: "email" })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    // MFA branch — no cookie yet; client must complete /mfa/verify.
    if ("requires_mfa" in result) {
      return {
        requires_mfa: true,
        mfa_pending_token: result.mfa_pending_token,
        expires_in: result.expires_in,
      };
    }
    const maxAge = body.remember ? result.refresh_expires_in : 0;
    if (maxAge > 0) {
      setRefreshCookie(res, result.refresh_token, maxAge);
    } else {
      res.cookie(REFRESH_COOKIE, result.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
    return this.toResponse(result);
  }

  // ─── forgot / reset / verify-email ─────────────────────────────────

  @Post("forgot-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 5, windowMs: 60_000, keyByField: "email" })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    return {};
  }

  @Post("reset-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ) {
    await this.auth.resetPassword(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    return {};
  }

  @Post("verify-email")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailInput,
    @Req() req: Request,
  ) {
    await this.auth.verifyEmail(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    return {};
  }

  @Post("resend-verification")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 3, windowMs: 60 * 60 * 1000, keyByField: "email" })
  async resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationSchema)) body: ResendVerificationInput,
    @Req() req: Request,
  ) {
    await this.auth.resendVerification(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
    return {};
  }

  // ─── MFA verify (second login step) ────────────────────────────────

  @Post("mfa/verify")
  @Public()
  @UseGuards(TenantMfaGuard)
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async mfaVerify(
    @CurrentMfaChallenger() challenger: TenantMfaPendingPrincipal,
    @Body(new ZodValidationPipe(MfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.mfaVerify(
      { userId: challenger.userId, tenantId: challenger.tenantId, jti: challenger.jti },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
    // Persistent cookie — MFA users are presumed to "remember" by virtue of having opted into MFA.
    setRefreshCookie(res, result.refresh_token, result.refresh_expires_in);
    return this.toResponse(result);
  }

  // ─── MFA enrollment + disable ──────────────────────────────────────

  @Post("mfa/enroll/start")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 10, windowMs: 60_000 })
  async mfaEnrollStart(@CurrentUser() user: TenantPrincipal, @Req() req: Request) {
    assertNotImpersonating(user, "mfa_enroll_start");
    return this.auth.mfaEnrollStart(
      { userId: user.userId, tenantId: user.tenantId },
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
  }

  @Post("mfa/enroll/verify")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async mfaEnrollVerify(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(MfaEnrollVerifySchema)) body: MfaEnrollVerifyInput,
    @Req() req: Request,
  ) {
    assertNotImpersonating(user, "mfa_enroll_verify");
    return this.auth.mfaEnrollVerify(
      { userId: user.userId, tenantId: user.tenantId },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
  }

  @Post("mfa/disable")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async mfaDisable(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(MfaDisableSchema)) body: MfaDisableInput,
    @Req() req: Request,
  ) {
    assertNotImpersonating(user, "mfa_disable");
    await this.auth.mfaDisable(
      { userId: user.userId, tenantId: user.tenantId },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
    return {};
  }

  @Post("mfa/recovery-codes/regenerate")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 5, windowMs: 60_000 })
  async mfaRegenerateRecoveryCodes(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(MfaRegenerateSchema)) body: MfaRegenerateInput,
    @Req() req: Request,
  ) {
    assertNotImpersonating(user, "mfa_regenerate_recovery_codes");
    return this.auth.mfaRegenerateRecoveryCodes(
      { userId: user.userId, tenantId: user.tenantId },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
  }

  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: "refresh_missing",
        message: "Refresh token missing",
      });
    }
    try {
      const result = await this.auth.refresh(refreshToken, {
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      setRefreshCookie(res, result.refresh_token, result.refresh_expires_in);
      return this.toResponse(result);
    } catch (e) {
      clearRefreshCookie(res);
      throw e;
    }
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: TenantPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = cookies[REFRESH_COOKIE];
    let refreshJti: string | undefined;
    if (refreshToken) {
      try {
        refreshJti = this.tokens.verifyRefresh(refreshToken).jti;
      } catch {
        /* ignore — token already invalid */
      }
    }
    await this.auth.logout({
      userId: user.userId,
      tenantId: user.tenantId,
      refreshJti,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    clearRefreshCookie(res);
  }

  @Get("me")
  async me(@CurrentUser() user: TenantPrincipal) {
    return this.auth.me({ userId: user.userId, tenantId: user.tenantId });
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async updateProfile(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileInput,
    @Req() req: Request,
  ) {
    return this.auth.updateProfile(
      {
        userId: user.userId,
        tenantId: user.tenantId,
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 5, windowMs: 60_000 })
  async changePassword(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(
      {
        userId: user.userId,
        tenantId: user.tenantId,
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
    // Drop the now-revoked refresh cookie so the client bounces to /login.
    clearRefreshCookie(res);
    return {};
  }

  @Post("change-email")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 5, windowMs: 60_000 })
  async changeEmail(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(ChangeEmailSchema)) body: ChangeEmailInput,
    @Req() req: Request,
  ) {
    await this.auth.changeEmail(
      {
        userId: user.userId,
        tenantId: user.tenantId,
        ...(user.impersonatorId ? { impersonatorId: user.impersonatorId } : {}),
      },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
    return {};
  }

  // ─── helpers ───────────────────────────────────────────────────────
  private toResponse(r: Awaited<ReturnType<AuthService["signup"]>>) {
    return {
      access_token: r.access_token,
      expires_in: r.expires_in,
      user: r.user,
      tenant: r.tenant,
    };
  }

}
