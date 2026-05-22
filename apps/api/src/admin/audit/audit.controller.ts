import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AdminAuditQueryService } from "./audit.service";

const PlatformAuditQuery = z.object({
  platform_user_id: z.string().uuid().optional(),
  target_tenant_id: z.string().uuid().optional(),
  action_prefix: z.string().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const LoginAsQuery = z.object({
  platform_user_id: z.string().uuid().optional(),
  target_tenant_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller("v1/admin")
@UseGuards(RateLimitGuard, AdminAuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditQueryService) {}

  @Get("platform-audit")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async platformAudit(
    @Query(new ZodValidationPipe(PlatformAuditQuery)) q: z.infer<typeof PlatformAuditQuery>,
  ) {
    return this.audit.listPlatformAudit(q);
  }

  @Get("login-as-audit")
  @RateLimit({ max: 60, windowMs: 60_000 })
  async loginAsAudit(
    @Query(new ZodValidationPipe(LoginAsQuery)) q: z.infer<typeof LoginAsQuery>,
  ) {
    return this.audit.listLoginAsSessions(q);
  }
}
