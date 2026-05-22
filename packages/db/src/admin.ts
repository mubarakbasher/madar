import type { PrismaClient } from "@prisma/client";
import { basePrisma } from "./client";

/**
 * Cross-tenant Prisma client for the super-admin app.
 *
 * Sets the Postgres session variable `app.is_super_admin = 'true'` before every
 * query, which RLS policies recognize to bypass tenant_id filtering.
 *
 * NEVER use this client in tenant code. The tenant Prisma client must never
 * set this flag — that is the entire safety boundary between realms.
 */
export const adminPrisma = basePrisma.$extends({
  name: "admin",
  query: {
    $allOperations({ args, query }) {
      const tx = (basePrisma as PrismaClient).$transaction([
        (basePrisma as PrismaClient)
          .$executeRaw`SELECT set_config('app.is_super_admin', 'true', TRUE)`,
        query(args) as any,
      ]);
      return tx.then(([, result]: unknown[]) => result);
    },
  },
});

export type AdminPrismaClient = typeof adminPrisma;
