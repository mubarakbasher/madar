import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { CurrentUser, type TenantPrincipal } from "../auth/current-user.decorator";
import { BankAccountsService } from "./bank-accounts.service";

const ListQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
});
type ListQuery = z.infer<typeof ListQuerySchema>;

@Controller("v1/tenant-bank-accounts")
@UseGuards(RateLimitGuard)
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(
    @CurrentUser() user: TenantPrincipal,
    @Query(new ZodValidationPipe(ListQuerySchema)) q: ListQuery,
  ) {
    return this.bankAccounts.listForTenant(user.tenantId, q);
  }
}
