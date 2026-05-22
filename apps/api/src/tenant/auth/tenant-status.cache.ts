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
