import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { getClientIp, getUserAgent } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { BillingService } from "../billing/billing.service";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { SelectPlanSchema, type SelectPlanInput } from "./dto/select-plan.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("v1")
@UseGuards(RateLimitGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Public — no auth required. Used by the post-signup picker AND can be
   * embedded on marketing pages later. Returns only active plans, sorted
   * by price ascending. Mirrors the existing GET /v1/plans but explicit
   * about the public scope.
   */
  @Get("public/plans")
  @Public()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async listPublicPlans() {
    return this.billing.listPlans();
  }

  /**
   * Tenant picks a plan post-signup. Bypasses the plan_required guard
   * via the allowlist in TenantAuthGuard. Idempotent-by-state: refuses
   * with 409 plan_already_assigned if the tenant already has a plan,
   * since re-picks belong to a future admin "Change plan" action.
   */
  @Post("onboarding/select-plan")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 10, windowMs: 60_000 })
  async selectPlan(
    @CurrentUser() user: TenantPrincipal,
    @Body(new ZodValidationPipe(SelectPlanSchema)) body: SelectPlanInput,
    @Req() req: Request,
  ) {
    return this.onboarding.selectPlan(
      { tenantId: user.tenantId, userId: user.userId },
      body,
      { ip: getClientIp(req), userAgent: getUserAgent(req) },
    );
  }
}
