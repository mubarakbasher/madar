import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { ImpersonationService } from "../../admin/impersonation/impersonation.service";

/**
 * Tenant-realm endpoints related to impersonation. The exit endpoint is here
 * (not under /v1/admin/) because the impersonation access token is a
 * tenant-realm token — the caller authenticates against TenantAuthGuard.
 */
@Controller("v1/impersonation")
@UseGuards(RateLimitGuard)
export class TenantImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Get("me")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async me(@CurrentUser() user: TenantPrincipal) {
    if (!user.impersonatorId) {
      return { active: false as const };
    }
    return {
      active: true as const,
      impersonator_id: user.impersonatorId,
      impersonator_email: user.impersonatorEmail ?? null,
    };
  }

  @Post("exit")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async exit(@CurrentUser() user: TenantPrincipal, @Req() req: Request) {
    if (!user.impersonatorId) {
      throw new BadRequestException({
        code: "not_impersonating",
        message: "This token is not an impersonation token",
      });
    }
    return this.impersonation.exit(
      user.impersonatorId,
      user.tenantId,
      user.jti,
      {
        platformUserId: user.impersonatorId,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      },
    );
  }
}
