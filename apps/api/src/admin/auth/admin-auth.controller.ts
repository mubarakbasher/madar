import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { clearCookieOptions, refreshCookieOptions } from "../../common/cookie-options";
import { AdminAuthService } from "./admin-auth.service";
import { AdminTokenService } from "./admin-token.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminMfaGuard } from "./admin-mfa.guard";
import {
  CurrentAdmin,
  CurrentMfaChallenger,
  type AdminPrincipal,
  type AdminMfaPendingPrincipal,
} from "./current-admin.decorator";
import { AdminLoginSchema, type AdminLoginInput } from "./dto/admin-login.dto";
import { MfaVerifySchema, type MfaVerifyInput } from "./dto/mfa-verify.dto";

const ADMIN_REFRESH_COOKIE = "madar_admin_refresh";

function setAdminRefreshCookie(res: Response, token: string, maxAgeSec: number): void {
  res.cookie(ADMIN_REFRESH_COOKIE, token, refreshCookieOptions(maxAgeSec));
}

function clearAdminRefreshCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_COOKIE, clearCookieOptions());
}

@Controller("v1/admin/auth")
@UseGuards(RateLimitGuard)
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly tokens: AdminTokenService,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000, keyByField: "email" })
  async login(
    @Body(new ZodValidationPipe(AdminLoginSchema)) body: AdminLoginInput,
    @Req() req: Request,
  ) {
    return this.auth.login(body, { ip: getClientIp(req), userAgent: getUserAgent(req) });
  }

  @Post("mfa/verify")
  @UseGuards(AdminMfaGuard)
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async mfaVerify(
    @CurrentMfaChallenger() challenger: AdminMfaPendingPrincipal,
    @Body(new ZodValidationPipe(MfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyMfa(challenger, body, {
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    setAdminRefreshCookie(res, result.refresh_token, result.refresh_expires_in);
    return this.toResponse(result);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60_000 })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = cookies[ADMIN_REFRESH_COOKIE];
    if (!refreshToken) {
      clearAdminRefreshCookie(res);
      throw new UnauthorizedException({
        code: "admin_refresh_missing",
        message: "Admin refresh token missing",
      });
    }
    try {
      const result = await this.auth.refresh(refreshToken, {
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
      setAdminRefreshCookie(res, result.refresh_token, result.refresh_expires_in);
      return this.toResponse(result);
    } catch (e) {
      clearAdminRefreshCookie(res);
      throw e;
    }
  }

  @Post("logout")
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = cookies[ADMIN_REFRESH_COOKIE];
    let refreshJti: string | undefined;
    if (refreshToken) {
      try {
        refreshJti = this.tokens.verifyRefresh(refreshToken).jti;
      } catch {
        /* ignore — already invalid */
      }
    }
    await this.auth.logout({
      platformUserId: admin.platformUserId,
      refreshJti,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    clearAdminRefreshCookie(res);
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  async me(@CurrentAdmin() admin: AdminPrincipal) {
    return this.auth.me(admin.platformUserId);
  }

  // ─── helpers ───────────────────────────────────────────────────────
  private toResponse(r: Awaited<ReturnType<AdminAuthService["verifyMfa"]>>) {
    return {
      access_token: r.access_token,
      expires_in: r.expires_in,
      platform_user: r.platform_user,
    };
  }
}
