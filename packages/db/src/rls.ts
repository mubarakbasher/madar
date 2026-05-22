import type { PrismaClient } from "@prisma/client";

/**
 * Low-level helpers for tests and seed scripts that need to drive session
 * variables manually (e.g. checking the FORCE RLS canary, asserting policy
 * rejections). Application code should NOT call these — use `tenantScoped` or
 * `adminPrisma` instead.
 */

export async function setTenantContext(
  client: PrismaClient,
  tenantId: string,
): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
}

export async function setSuperAdminContext(client: PrismaClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.is_super_admin', 'true', TRUE)`;
}

export async function clearContext(client: PrismaClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.current_tenant_id', '', TRUE)`;
  await client.$executeRaw`SELECT set_config('app.is_super_admin', '', TRUE)`;
}
