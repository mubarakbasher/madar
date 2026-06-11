import type { PrismaClient } from "@prisma/client";

/**
 * Low-level helpers for tests and seed scripts that need to drive session
 * variables manually (e.g. checking the FORCE RLS canary, asserting policy
 * rejections). Application code should NOT call these — use `tenantScoped` or
 * `adminPrisma` instead.
 *
 * Note: there is no super-admin session variable anymore (ADR 0004) — the
 * admin realm's RLS bypass is the `madar_admin` ROLE, not a GUC.
 */

export async function setTenantContext(
  client: PrismaClient,
  tenantId: string,
): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
}

export async function clearContext(client: PrismaClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.current_tenant_id', '', TRUE)`;
}
