/**
 * Tenant subscription-status cache.
 *
 * Status is queried per-mutation by `TenantAuthGuard` to enforce read-only
 * mode for suspended/cancelled tenants. Reading the platform `tenants` table
 * on every request would be wasteful, so we cache the status in Redis with a
 * 30-second TTL. Transitions in `BillingTrackerService.runDailyTick()` call
 * `invalidateTenantStatus` to keep the cache honest immediately after a
 * lifecycle move.
 *
 * Falls back to the in-memory cache that `RedisService` provides when
 * `REDIS_URL` is not configured (dev/test).
 */
// eslint-disable-next-line no-restricted-imports
import { adminPrisma } from "@madar/db";
import type { RedisService } from "../../common/redis.service";

const TTL_SECONDS = 30;
const VALID_STATUSES = new Set([
  "trialing",
  "active",
  "grace_period",
  "suspended",
  "cancelled",
]);

export type TenantStatus =
  | "trialing"
  | "active"
  | "grace_period"
  | "suspended"
  | "cancelled";

function key(tenantId: string): string {
  return `tenant-status:${tenantId}`;
}

export async function getTenantStatus(
  tenantId: string,
  redis: RedisService,
): Promise<TenantStatus | null> {
  const cached = await redis.get(key(tenantId));
  if (cached && VALID_STATUSES.has(cached)) return cached as TenantStatus;

  const row = await adminPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  if (!row) return null;

  const status = row.status as TenantStatus;
  if (VALID_STATUSES.has(status)) {
    await redis.setEx(key(tenantId), status, TTL_SECONDS);
  }
  return status;
}

export async function invalidateTenantStatus(
  tenantId: string,
  redis: RedisService,
): Promise<void> {
  await redis.del(key(tenantId));
}

// ── plan_id presence cache ────────────────────────────────────────────
// Used by TenantAuthGuard to gate feature endpoints behind "has the tenant
// picked a plan?". Tenant flips from no-plan to has-plan exactly once
// (via /v1/onboarding/select-plan), at which point the onboarding service
// calls invalidateTenantHasPlan to drop the negative cache entry.

const PLAN_TTL_SECONDS = 30;

function planKey(tenantId: string): string {
  return `tenant-has-plan:${tenantId}`;
}

export async function getTenantHasPlan(
  tenantId: string,
  redis: RedisService,
): Promise<boolean> {
  const cached = await redis.get(planKey(tenantId));
  if (cached === "1") return true;
  if (cached === "0") return false;

  const row = await adminPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan_id: true },
  });
  const hasPlan = !!row?.plan_id;
  await redis.setEx(planKey(tenantId), hasPlan ? "1" : "0", PLAN_TTL_SECONDS);
  return hasPlan;
}

export async function invalidateTenantHasPlan(
  tenantId: string,
  redis: RedisService,
): Promise<void> {
  await redis.del(planKey(tenantId));
}
