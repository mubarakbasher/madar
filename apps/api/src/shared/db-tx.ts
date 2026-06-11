// The tenantScoped extended client wraps EVERY operation in its own implicit
// batch $transaction on basePrisma, so an interactive
// `scoped.$transaction(async tx => ...)` does NOT give single-connection
// atomicity: each inner statement runs on its own pooled connection, locks
// release between statements, and a crash mid-sequence leaves partial writes
// (e.g. a stock_movement without its branch_stock update). Multi-statement
// tenant writes must instead run on the raw client with the RLS context set
// once via transaction-local set_config — withTenantTx is the only
// sanctioned way to do that.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, basePrisma, Prisma, type PrismaClient } from "@madar/db";

export type Tx = Prisma.TransactionClient;

/**
 * Run `fn` inside ONE real database transaction with RLS scoped to
 * `tenantId`. Every statement shares the connection, row locks hold for the
 * whole callback, and the tenant context evaporates at COMMIT/ROLLBACK.
 */
export async function withTenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("withTenantTx() requires a tenant id");
  return (basePrisma as PrismaClient).$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    return fn(tx);
  });
}

/**
 * Run `fn` inside ONE real database transaction on the admin connection.
 * Since ADR 0004, adminPrisma is a plain client on the `madar_admin` role —
 * its RLS bypass is the ROLE itself, not a session variable — so a normal
 * interactive transaction is already correct; this helper keeps one obvious
 * entry point alongside withTenantTx for multi-step admin writes.
 * Admin/platform code only — never reachable from tenant input.
 */
export async function withAdminTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (adminPrisma as PrismaClient).$transaction(async (tx) => fn(tx));
}
