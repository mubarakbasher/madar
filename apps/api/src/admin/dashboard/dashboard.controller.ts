import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { DashboardService } from "./dashboard.service";

@Controller("v1/admin/dashboard")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("kpi")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async kpi() {
    return this.dashboard.computeKpi();
  }

  @Get("activity")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async activity(@Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.dashboard.listActivity(limit);
  }
}
