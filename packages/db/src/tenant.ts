import type { PrismaClient } from "@prisma/client";
import { basePrisma } from "./client";

/**
 * Tenant-scoped Prisma client.
 *
 * Wraps every operation in a transaction that first sets the Postgres session
 * variable `app.current_tenant_id`. Row-level-security policies on every
 * tenant-scoped table use this variable to filter rows.
 *
 * `set_config(key, value, TRUE)` is transaction-local (equivalent to SET LOCAL),
 * so it MUST run inside the same transaction as the query. Without the
 * surrounding $transaction, Prisma runs the SET in its own implicit transaction
 * and the variable evaporates before the query runs — silently breaking
 * isolation. The bundled-array form of $transaction guarantees both statements
 * share the same connection and transaction.
 *
 * NEVER use this client in admin code. NEVER export a singleton — tenantId is
 * per-request state.
 */
export function tenantScoped(tenantId: string) {
  if (!tenantId) {
    throw new Error("tenantScoped() requires a tenant id");
  }

  return basePrisma.$extends({
    name: "tenant-scoped",
    query: {
      $allOperations({ args, query }) {
        const tx = (basePrisma as PrismaClient).$transaction([
          (basePrisma as PrismaClient)
            .$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
          query(args) as any,
        ]);
        return tx.then(([, result]: unknown[]) => result);
      },
    },
  });
}

export type TenantScopedClient = ReturnType<typeof tenantScoped>;
