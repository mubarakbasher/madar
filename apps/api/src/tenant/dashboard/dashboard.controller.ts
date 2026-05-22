import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { DashboardService } from "./dashboard.service";
import { DashboardQuerySchema, type DashboardQuery } from "./dto/dashboard.dto";

/**
 * Owner dashboard — chain-wide aggregation.
 *
 * Pairs with the per-branch view at GET /v1/branches/:id/dashboard. This
 * endpoint is intentionally scope-free: branch filtering is the job of the
 * branch endpoint. Adding a ?branch_id query here would duplicate concerns
 * and complicate the rule engine.
 */
@Controller("v1/dashboard")
@UseGuards(RateLimitGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(DashboardQuerySchema)) _q: DashboardQuery,
  ) {
    this.dashboard.assertCanRead(user.role);
    return this.dashboard.getOwnerDashboard(user.tenantId);
  }
}
