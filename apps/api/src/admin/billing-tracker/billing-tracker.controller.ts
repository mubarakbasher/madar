import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { BillingTrackerService } from "./billing-tracker.service";

const TICK_ROLES = new Set(["owner", "finance"]);

@Controller("v1/admin/billing")
@UseGuards(AdminAuthGuard, RateLimitGuard)
export class BillingTrackerController {
  constructor(private readonly tracker: BillingTrackerService) {}

  /**
   * Manual trigger for the daily billing tick. Idempotent — running it twice in
   * a day produces zero writes on the second pass. Once BullMQ ships this is
   * also wired to a cron schedule (1.15 infra pass).
   */
  @Post("tick")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 4, windowMs: 60_000 })
  async tick(@CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (!TICK_ROLES.has(admin.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only Platform Owner and Finance roles can trigger the billing tick",
      });
    }
    return this.tracker.runDailyTick({
      platformUserId: admin.platformUserId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
