import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __madarAdminPrisma: PrismaClient | undefined;
}

/**
 * Cross-tenant Prisma client for the super-admin realm.
 *
 * Connects as the `madar_admin` role (ADMIN_DATABASE_URL), whose
 * `admin_full_access` RLS policy grants every row — the ROLE is the
 * privilege. There is no session-variable bypass anymore (ADR 0004): the old
 * `app.is_super_admin` GUC could be set by any session, so SQL injection in
 * the tenant realm would have escalated to all tenants at once.
 *
 * This is a plain (non-extended) client, so interactive `$transaction`s on
 * it are real single-connection transactions.
 *
 * NEVER use this client in tenant code. The tenant client (`tenantScoped`)
 * connects as `madar_app`, to which only the tenant_isolation policy applies.
 */
function createAdminPrisma(): PrismaClient {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error(
      "ADMIN_DATABASE_URL is required: adminPrisma connects as the madar_admin " +
        "role (see .env.example). It must NOT share DATABASE_URL — that role " +
        "has no RLS bypass.",
    );
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

export const adminPrisma: PrismaClient = globalThis.__madarAdminPrisma ?? createAdminPrisma();

if (process.env.NODE_ENV !== "production") {
  globalThis.__madarAdminPrisma = adminPrisma;
}

export type AdminPrismaClient = typeof adminPrisma;
