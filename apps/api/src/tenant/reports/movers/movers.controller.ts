import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../../auth/current-user.decorator";
import { MoversService } from "./movers.service";
import { MoversQuerySchema, type MoversQuery } from "./dto/movers.dto";

/**
 * Movers / margin analysis — top-N products by revenue, units, or gross
 * profit over a date window, plus a slow-movers list (in stock, barely
 * selling). Read-only. PAGES §39.
 */
@Controller("v1/reports/movers")
@UseGuards(RateLimitGuard)
export class MoversController {
  constructor(private readonly svc: MoversService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async get(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(MoversQuerySchema)) q: MoversQuery,
  ) {
    this.svc.assertCanRead(user.role);
    return this.svc.getMovers(user.tenantId, q);
  }
}
