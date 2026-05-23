import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { adminPrisma } from "@madar/db";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import type { CreatePlanInput, ListPlansQuery, UpdatePlanInput } from "./dto/plan-schemas";

export interface PlanResponse {
  id: string;
  code: string;
  name_i18n: { en: string; ar: string };
  monthly_price_cents: string;
  currency_code: string;
  limits: { txns: number; users: number; branches: number; storage_gb: number };
  is_active: boolean;
  tenant_count: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PlansService {
  constructor(private readonly audit: AdminAuditService) {}

  async list(query: ListPlansQuery): Promise<PlanResponse[]> {
    const plans = await adminPrisma.plan.findMany({
      where: query.include_inactive ? {} : { is_active: true },
      orderBy: [{ monthly_price_cents: "asc" }, { code: "asc" }],
      include: { _count: { select: { tenants: true } } },
    });
    return plans.map(toResponse);
  }

  async get(id: string): Promise<PlanResponse> {
    const plan = await adminPrisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!plan) {
      throw new NotFoundException({ code: "plan_not_found", message: "Plan not found" });
    }
    return toResponse(plan);
  }

  async create(input: CreatePlanInput, ctx: AdminAuditCtx): Promise<PlanResponse> {
    const existing = await adminPrisma.plan.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        code: "plan_code_taken",
        message: `Plan code '${input.code}' is already in use.`,
      });
    }

    const created = await adminPrisma.plan.create({
      data: {
        code: input.code,
        name_i18n: { en: input.name_en, ar: input.name_ar },
        monthly_price_cents: BigInt(input.monthly_price_cents),
        currency_code: input.currency_code,
        limits: input.limits,
        is_active: true,
      },
      include: { _count: { select: { tenants: true } } },
    });

    await this.audit.write(ctx, {
      action: "plan.created",
      targetEntity: "plan",
      targetId: created.id,
      metadata: {
        code: created.code,
        monthly_price_cents: created.monthly_price_cents.toString(),
        currency_code: created.currency_code,
        limits: created.limits,
      },
    });

    return toResponse(created);
  }

  async update(id: string, input: UpdatePlanInput, ctx: AdminAuditCtx): Promise<PlanResponse> {
    const before = await adminPrisma.plan.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "plan_not_found", message: "Plan not found" });
    }

    const data: Record<string, unknown> = {};
    if (input.name_en !== undefined || input.name_ar !== undefined) {
      const prevName = (before.name_i18n ?? {}) as { en?: string; ar?: string };
      data.name_i18n = {
        en: input.name_en ?? prevName.en ?? "",
        ar: input.name_ar ?? prevName.ar ?? "",
      };
    }
    if (input.monthly_price_cents !== undefined) {
      data.monthly_price_cents = BigInt(input.monthly_price_cents);
    }
    if (input.currency_code !== undefined) {
      data.currency_code = input.currency_code;
    }
    if (input.limits !== undefined) {
      data.limits = input.limits;
    }
    data.updated_at = new Date();

    const updated = await adminPrisma.plan.update({
      where: { id },
      data,
      include: { _count: { select: { tenants: true } } },
    });

    await this.audit.write(ctx, {
      action: "plan.updated",
      targetEntity: "plan",
      targetId: updated.id,
      metadata: {
        code: updated.code,
        before: serializePlanForAudit(before),
        after: serializePlanForAudit(updated),
      },
    });

    return toResponse(updated);
  }

  async setActive(id: string, active: boolean, ctx: AdminAuditCtx): Promise<PlanResponse> {
    const before = await adminPrisma.plan.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "plan_not_found", message: "Plan not found" });
    }
    if (before.is_active === active) {
      // No-op — still surface the current row for the UI.
      return this.get(id);
    }

    const updated = await adminPrisma.plan.update({
      where: { id },
      data: { is_active: active, updated_at: new Date() },
      include: { _count: { select: { tenants: true } } },
    });

    await this.audit.write(ctx, {
      action: active ? "plan.activated" : "plan.deactivated",
      targetEntity: "plan",
      targetId: updated.id,
      metadata: { code: updated.code },
    });

    return toResponse(updated);
  }
}

type PlanRow = {
  id: string;
  code: string;
  name_i18n: unknown;
  monthly_price_cents: bigint;
  currency_code: string;
  limits: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  _count: { tenants: number };
};

function toResponse(p: PlanRow): PlanResponse {
  const name = (p.name_i18n ?? {}) as { en?: string; ar?: string };
  const limits = (p.limits ?? {}) as Partial<Record<"txns" | "users" | "branches" | "storage_gb", number>>;
  return {
    id: p.id,
    code: p.code,
    name_i18n: { en: name.en ?? "", ar: name.ar ?? "" },
    monthly_price_cents: p.monthly_price_cents.toString(),
    currency_code: p.currency_code,
    limits: {
      txns: limits.txns ?? 0,
      users: limits.users ?? 0,
      branches: limits.branches ?? 0,
      storage_gb: limits.storage_gb ?? 0,
    },
    is_active: p.is_active,
    tenant_count: p._count.tenants,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

function serializePlanForAudit(p: {
  code: string;
  name_i18n: unknown;
  monthly_price_cents: bigint;
  currency_code: string;
  limits: unknown;
  is_active: boolean;
}): Record<string, unknown> {
  return {
    code: p.code,
    name_i18n: p.name_i18n,
    monthly_price_cents: p.monthly_price_cents.toString(),
    currency_code: p.currency_code,
    limits: p.limits,
    is_active: p.is_active,
  };
}
