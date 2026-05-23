import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
// Onboarding reads the platform-scoped `plans` table via adminPrisma, then
// updates the tenant + writes an audit_log entry via tenantScoped.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { RedisService } from "../../common/redis.service";
import { invalidateTenantHasPlan } from "../auth/tenant-status.cache";
import type { SelectPlanInput } from "./dto/select-plan.dto";

export interface SelectPlanResult {
  tenant_id: string;
  plan_id: string;
  plan_code: string;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly redis: RedisService) {}

  async selectPlan(
    p: { tenantId: string; userId: string },
    input: SelectPlanInput,
    ctx: { ip: string; userAgent: string },
  ): Promise<SelectPlanResult> {
    // Refuse if already picked — re-picks happen via a future admin
    // "Change plan" action, not this self-service endpoint.
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: p.tenantId },
      select: { id: true, plan_id: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }
    if (tenant.plan_id) {
      throw new ConflictException({
        code: "plan_already_assigned",
        message: "Tenant already has a plan. Use the admin app to change plans.",
      });
    }

    const plan = await adminPrisma.plan.findUnique({ where: { id: input.plan_id } });
    if (!plan) {
      throw new NotFoundException({ code: "plan_not_found", message: "Plan not found" });
    }
    if (!plan.is_active) {
      throw new ConflictException({
        code: "plan_inactive",
        message: "That plan isn't available. Pick a different one.",
      });
    }

    // adminPrisma for the tenant update — `tenants` is a platform table.
    await adminPrisma.tenant.update({
      where: { id: p.tenantId },
      data: { plan_id: plan.id, updated_at: new Date() },
    });

    // Audit entry on the tenant's own audit_log via the tenant-scoped client.
    const scoped = tenantScoped(p.tenantId);
    await scoped.auditLog.create({
      data: {
        tenant_id: p.tenantId,
        user_id: p.userId,
        action: "tenant.plan_selected",
        entity: "plan",
        entity_id: plan.id,
        ip: ctx.ip,
        user_agent: ctx.userAgent,
        after: { plan_id: plan.id, plan_code: plan.code },
      },
    });

    // Drop the "no plan" cache entry so the next request unlocks immediately.
    await invalidateTenantHasPlan(p.tenantId, this.redis);

    return {
      tenant_id: p.tenantId,
      plan_id: plan.id,
      plan_code: plan.code,
    };
  }
}
