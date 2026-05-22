import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../../auth/current-user.decorator";
import { TrendsService } from "./trends.service";
import { TrendsQuerySchema, type TrendsQuery } from "./dto/trends.dto";

/**
 * Trend analysis report — PAGES §41.
 *
 * GET /v1/reports/trends ? currency & metric & window & compare & branch_id
 *
 * 60 req/min/IP. Authz via TenantAuthGuard (registered globally for the
 * tenant routes module) + role check in the service.
 */
@Controller("v1/reports/trends")
@UseGuards(RateLimitGuard)
export class TrendsController {
  constructor(private readonly trends: TrendsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(TrendsQuerySchema)) q: TrendsQuery,
  ) {
    this.trends.assertCanRead(user.role);
    return this.trends.getTrends(user.tenantId, q);
  }
}
