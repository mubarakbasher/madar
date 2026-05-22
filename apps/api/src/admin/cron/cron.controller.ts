/**
 * Admin endpoints for manually triggering the cron jobs. Useful for verifying
 * a deployment, smoke-testing email flows, and the integration tests in
 * `apps/api/test/cron/`. Cron firings come through `AdminCronProcessor` (when
 * Redis is wired) and call into the same `AdminCronService` methods.
 *
 * Role-gated to Platform Owner / Finance (matches billing-tracker), 4/min
 * rate limit, idempotency-key required per attempt.
 */
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
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { Idempotent, IdempotencyInterceptor } from "../../common/idempotency.interceptor";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin, type AdminPrincipal } from "../auth/current-admin.decorator";
import { AdminCronService } from "./cron.service";

const ALLOWED_ROLES = new Set(["owner", "finance"]);

function assertCronTriggerRole(user: AdminPrincipal): void {
  if (!ALLOWED_ROLES.has(user.role)) {
    throw new ForbiddenException({
      code: "forbidden_role",
      message: "Only Platform Owner or Finance can trigger cron jobs",
    });
  }
}

@Controller("v1/admin/cron")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class AdminCronController {
  constructor(private readonly cron: AdminCronService) {}

  @Post("trial-reminders/run-now")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 4, windowMs: 60_000 })
  async runTrialReminders(@CurrentAdmin() user: AdminPrincipal, @Req() req: Request) {
    assertCronTriggerRole(user);
    return this.cron.runTrialReminderTick({
      platformUserId: user.platformUserId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post("low-stock/run-now")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @RateLimit({ max: 4, windowMs: 60_000 })
  async runLowStock(@CurrentAdmin() user: AdminPrincipal, @Req() req: Request) {
    assertCronTriggerRole(user);
    return this.cron.runLowStockTick({
      platformUserId: user.platformUserId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
