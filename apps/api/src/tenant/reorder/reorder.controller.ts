import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { ReorderService } from "./reorder.service";
import {
  ReorderSuggestionsQuerySchema,
  type ReorderSuggestionsQuery,
} from "./dto/suggestions-query.dto";

@Controller("v1")
@UseGuards(RateLimitGuard)
export class ReorderController {
  constructor(private readonly reorder: ReorderService) {}

  @Get("reorder/suggestions")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async suggestions(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ReorderSuggestionsQuerySchema)) q: ReorderSuggestionsQuery,
  ) {
    return this.reorder.getSuggestions(
      { tenantId: user.tenantId, userId: user.userId, role: user.role },
      q,
    );
  }
}
