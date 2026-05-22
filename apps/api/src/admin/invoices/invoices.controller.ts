import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AdminInvoicesService } from "./invoices.service";

const QuerySchema = z.object({
  status: z.string().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type Query = z.infer<typeof QuerySchema>;

@Controller("v1/admin/invoices")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class AdminInvoicesController {
  constructor(private readonly invoices: AdminInvoicesService) {}

  @Get()
  @RateLimit({ max: 60, windowMs: 60_000 })
  async list(@Query(new ZodValidationPipe(QuerySchema)) q: Query) {
    return this.invoices.list(q);
  }
}
