import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { BillingService } from "./billing.service";

@Controller("v1")
@UseGuards(RateLimitGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("plans")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listPlans() {
    return this.billing.listPlans();
  }

  @Get("subscription")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getSubscription(@CurrentUser() user: TenantPrincipal) {
    return this.billing.getSubscription(user.tenantId);
  }

  @Get("subscription-invoices")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listInvoices(
    @CurrentUser() user: TenantPrincipal,
    @Query("status") status?: string,
  ) {
    return this.billing.listInvoices(user.tenantId, { status });
  }

  @Get("subscription-invoices/:id")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async getInvoice(
    @CurrentUser() user: TenantPrincipal,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.billing.getInvoice(user.tenantId, id);
  }

  @Get("platform-bank-accounts")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listPlatformBankAccounts(
    @CurrentUser() user: TenantPrincipal,
    @Query("currency") currency?: string,
    @Query("country_code") countryCode?: string,
  ) {
    // Default to tenant's default currency if not specified; falls back to
    // listing every active platform account when there's no specific filter.
    void user;
    return this.billing.listPlatformBankAccounts({
      currency: currency?.toUpperCase(),
      countryCode: countryCode?.toUpperCase(),
    });
  }
}
