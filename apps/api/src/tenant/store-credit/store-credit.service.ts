import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// We need a single connection that holds the FOR UPDATE lock across the
// SELECT → ledger insert → customer update sequence. Both `tenantScoped()`
// and `adminPrisma` use $extends to wrap each operation in its own implicit
// $transaction on basePrisma, which routes each call to a fresh connection
// from the pool — releasing the lock between statements and silently breaking
// safety guarantees for concurrent writers.
//
// Fix: drive the interactive transaction off the underlying basePrisma client
// directly, then set the RLS tenant context once at the top of the tx via
// `SET LOCAL app.current_tenant_id`. Every subsequent statement runs on the
// same connection and within the same transaction, so RLS still filters
// every row exactly as it would under tenantScoped() and the row lock holds.
// eslint-disable-next-line no-restricted-imports
import { basePrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { AdjustStoreCreditBody } from "./dto/adjust.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

const MAX_LEDGER_PAGE = 100;

export interface ApiStoreCreditLedgerEntry {
  id: string;
  amount_minor: string;
  balance_after_minor: string;
  reference_table: string;
  reference_id: string | null;
  note_i18n: { en?: string; ar?: string } | null;
  created_by: string | null;
  created_at: string;
}

export interface ApiStoreCreditSummary {
  customer_id: string;
  balance_minor: string;
  currency_code: string | null;
  ledger: ApiStoreCreditLedgerEntry[];
}

interface CustomerLockRow {
  id: string;
  tenant_id: string;
  store_credit_balance_minor: bigint;
  store_credit_currency_code: string | null;
  deleted_at: Date | null;
}

@Injectable()
export class StoreCreditService {
  private readonly logger = new Logger(StoreCreditService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── role gates ────────────────────────────────────────────────────

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read store-credit data",
      });
    }
  }

  assertCanMutate(role: string): void {
    if (!MUTATOR_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers may adjust store credit",
      });
    }
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async getSummary(tenantId: string, customerId: string): Promise<ApiStoreCreditSummary> {
    const scoped = tenantScoped(tenantId);
    const customer = await scoped.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        deleted_at: true,
        store_credit_balance_minor: true,
        store_credit_currency_code: true,
      },
    });
    if (!customer || customer.deleted_at) {
      throw new NotFoundException({ code: "customer_not_found", message: "Customer not found" });
    }

    const ledger = await scoped.storeCreditLedger.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: "desc" },
      take: MAX_LEDGER_PAGE,
    });

    return {
      customer_id: customer.id,
      balance_minor: customer.store_credit_balance_minor.toString(),
      currency_code: customer.store_credit_currency_code,
      ledger: ledger.map((r) => ({
        id: r.id,
        amount_minor: r.amount_minor.toString(),
        balance_after_minor: r.balance_after_minor.toString(),
        reference_table: r.reference_table,
        reference_id: r.reference_id,
        note_i18n: (r.note_i18n as { en?: string; ar?: string } | null) ?? null,
        created_by: r.created_by,
        created_at: r.created_at.toISOString(),
      })),
    };
  }

  // ─── mutations ─────────────────────────────────────────────────────

  async adjust(
    tenantId: string,
    customerId: string,
    actorId: string,
    body: AdjustStoreCreditBody,
    ctx: AuditCtx,
  ): Promise<ApiStoreCreditSummary> {
    const amountMinor = BigInt(body.amount_minor);
    if (amountMinor === 0n) {
      throw new BadRequestException({
        code: "amount_zero",
        message: "amount_minor must be non-zero",
      });
    }

    // We need a single connection that holds the customer row lock across
    // SELECT FOR UPDATE → INSERT ledger → UPDATE customers. The tenantScoped
    // extension wraps EACH operation in its own implicit transaction (so it
    // can re-`SET LOCAL app.current_tenant_id` per op), which breaks the lock
    // chain — across two parallel requests both readers would see the same
    // pre-update balance.
    //
    // Fix: drive the entire flow from basePrisma's interactive $transaction,
    // and apply the tenant context manually with `SET LOCAL` so RLS still
    // filters every row exactly like tenantScoped() would. RLS canary tests
    // cover the safety contract.
    const { newBalance, ledgerId, before, currencyCode } = await basePrisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, TRUE)`,
          tenantId,
        );

        const rows = await tx.$queryRawUnsafe<CustomerLockRow[]>(
          `SELECT id, tenant_id, store_credit_balance_minor,
                  store_credit_currency_code, deleted_at
           FROM customers
           WHERE id = $1::uuid
           FOR UPDATE`,
          customerId,
        );
        const customer = rows[0];
        if (!customer || customer.deleted_at || customer.tenant_id !== tenantId) {
          throw new NotFoundException({
            code: "customer_not_found",
            message: "Customer not found",
          });
        }

        const beforeBalance = BigInt(customer.store_credit_balance_minor);
        const afterBalance = beforeBalance + amountMinor;
        if (afterBalance < 0n) {
          throw new BadRequestException({
            code: "insufficient_balance",
            message: "Adjustment would make the balance negative",
            fields: {
              balance_minor: beforeBalance.toString(),
              amount_minor: amountMinor.toString(),
            },
          });
        }

        // Currency rule: set on first credit, locked thereafter.
        let resolvedCurrency = customer.store_credit_currency_code;
        if (body.currency_code) {
          if (resolvedCurrency && resolvedCurrency !== body.currency_code) {
            throw new BadRequestException({
              code: "currency_mismatch",
              message: "Customer store-credit currency is already set; cannot change it",
              fields: {
                expected: resolvedCurrency,
                received: body.currency_code,
              },
            });
          }
          resolvedCurrency = body.currency_code;
        }
        if (!resolvedCurrency) {
          throw new BadRequestException({
            code: "currency_required",
            message: "currency_code is required on the first store-credit movement",
          });
        }

        const ledger = await tx.storeCreditLedger.create({
          data: {
            tenant_id: tenantId,
            customer_id: customerId,
            amount_minor: amountMinor,
            balance_after_minor: afterBalance,
            currency_code: resolvedCurrency,
            reference_table: "manual_adjust",
            reference_id: null,
            note_i18n: body.note_i18n,
            created_by: actorId,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: {
            store_credit_balance_minor: afterBalance,
            store_credit_currency_code: resolvedCurrency,
          },
        });

        return {
          newBalance: afterBalance,
          ledgerId: ledger.id,
          before: beforeBalance,
          currencyCode: resolvedCurrency,
        };
      },
    );

    await this.audit
      .writeTenantScoped(ctx, {
        action: "store_credit_adjusted",
        entity: "customer",
        entityId: customerId,
        before: { balance_minor: before.toString() },
        after: {
          balance_minor: newBalance.toString(),
          amount_minor: amountMinor.toString(),
          currency_code: currencyCode,
          ledger_id: ledgerId,
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.getSummary(tenantId, customerId);
  }
}
