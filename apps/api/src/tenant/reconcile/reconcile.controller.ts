import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { ReconcileService } from "./reconcile.service";

@Controller("v1/reconcile")
@UseGuards(RateLimitGuard)
export class ReconcileController {
  constructor(private readonly reconcile: ReconcileService) {}

  @Get("day")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getDay(
    @CurrentUser() user: TenantPrincipal,
    @Query("date") date: string | undefined,
    @Query("branch_id") branchId: string | undefined,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        code: "invalid_date",
        message: "date must be YYYY-MM-DD",
      });
    }
    return this.reconcile.getDay(user.tenantId, user.role, {
      date,
      branchId: branchId || undefined,
    });
  }
}
