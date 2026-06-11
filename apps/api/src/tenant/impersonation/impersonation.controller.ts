import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { ImpersonationService } from "../../admin/impersonation/impersonation.service";

const ExchangeSchema = z.object({ code: z.string().regex(/^[0-9a-f]{64}$/i) });
type ExchangeInput = z.infer<typeof ExchangeSchema>;

/**
 * Tenant-realm endpoints related to impersonation. The exit endpoint is here
 * (not under /v1/admin/) because the impersonation access token is a
 * tenant-realm token — the caller authenticates against TenantAuthGuard.
 */
@Controller("v1/impersonation")
@UseGuards(RateLimitGuard)
export class TenantImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  /**
   * Swap the one-time handoff code (minted by the admin app's "Login as")
   * for the impersonation JWT. @Public: the caller has no tenant session
   * yet — the single-use, 60s, 256-bit code is the credential. POST keeps
   * the JWT out of URLs/history/access logs.
   */
  @Public()
  @Post("exchange")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async exchange(@Body(new ZodValidationPipe(ExchangeSchema)) body: ExchangeInput) {
    return this.impersonation.exchange(body.code);
  }

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
