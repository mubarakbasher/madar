import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { ImpersonationService } from "./impersonation.service";
import { StartImpersonationSchema, type StartImpersonationBody } from "./dto/start-impersonation.dto";

@Controller("v1/admin")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class AdminImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Post("tenants/:id/impersonate")
  @RateLimit({ max: 30, windowMs: 60_000 })
  async start(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param("id", new ParseUUIDPipe()) tenantId: string,
    @Body(new ZodValidationPipe(StartImpersonationSchema)) body: StartImpersonationBody,
    @Req() req: Request,
  ) {
    return this.impersonation.start(admin, tenantId, body, {
      platformUserId: admin.platformUserId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
