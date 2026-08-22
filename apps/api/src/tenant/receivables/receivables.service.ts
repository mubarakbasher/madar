import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// See store-credit.service.ts for the rationale: we need a single connection
// that holds the customer row lock across SELECT → sale_payment insert →
// ledger insert → customer/sale update. tenantScoped()/adminPrisma wrap each
// operation in its own implicit transaction, which would release the lock
// between statements. Fix: drive the interactive transaction off the
// underlying basePrisma client and apply RLS manually via `SET LOCAL`.
// eslint-disable-next-line no-restricted-imports
import { basePrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { SettleReceivableBody } from "./dto/settle.dto";

const MUTATOR_ROLES = new Set(["owner", "manager"]);
const READER_ROLES = new Set(["owner", "manager", "accountant"]);

const MAX_LEDGER_PAGE = 100;

export interface ApiReceivableLedgerEntry {
  id: string;
  amount_minor: string;
  balance_after_minor: string;
  reference_table: string;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ApiReceivableOpenSale {
  sale_id: string;
  code: string;
  occurred_at: string;
  total_cents: string;
  balance_due_cents: string;
  payment_status: string;
}

export interface ApiReceivableSummary {
  customer_id: string;
  balance_minor: string;
  currency_code: string | null;
  open_sales: ApiReceivableOpenSale[];
  ledger: ApiReceivableLedgerEntry[];
}

export interface ApiSettleResult extends ApiReceivableSummary {
  sale_payment_id: string;
}

interface CustomerLockRow {
  id: string;
  tenant_id: string;
  receivable_balance_minor: bigint;
  receivable_currency_code: string | null;
  deleted_at: Date | null;
}

@Injectable()
export class ReceivablesService {
  private readonly logger = new Logger(ReceivablesService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── role gates ────────────────────────────────────────────────────

  assertCanRead(role: string): void {
    if (!READER_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "You do not have permission to read receivables data",
      });
    }
  }

  assertCanMutate(role: string): void {
    if (!MUTATOR_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers may settle receivables",
      });
    }
  }

  // ─── reads ─────────────────────────────────────────────────────────

  async getSummary(tenantId: string, customerId: string): Promise<ApiReceivableSummary> {
    const scoped = tenantScoped(tenantId);
    const customer = await scoped.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        deleted_at: true,
        receivable_balance_minor: true,
        receivable_currency_code: true,
      },
    });
    if (!customer || customer.deleted_at) {
      throw new NotFoundException({ code: "customer_not_found", message: "Customer not found" });
    }

    const openSales = await scoped.sale.findMany({
      where: { customer_id: customerId, balance_due_cents: { gt: 0n }, deleted_at: null },
      orderBy: { occurred_at: "desc" },
      select: {
        id: true,
        code: true,
        occurred_at: true,
        total_cents: true,
        balance_due_cents: true,
        payment_status: true,
      },
    });

    const ledger = await scoped.customerReceivableLedger.findMany({
      where: { customer_id: customerId },
      orderBy: { created_at: "desc" },
      take: MAX_LEDGER_PAGE,
    });

    return {
      customer_id: customer.id,
      balance_minor: customer.receivable_balance_minor.toString(),
      currency_code: customer.receivable_currency_code,
      open_sales: openSales.map((s) => ({
        sale_id: s.id,
        code: s.code,
        occurred_at: s.occurred_at.toISOString(),
        total_cents: s.total_cents.toString(),
        balance_due_cents: s.balance_due_cents.toString(),
        payment_status: s.payment_status,
      })),
      ledger: ledger.map((r) => ({
        id: r.id,
        amount_minor: r.amount_minor.toString(),
        balance_after_minor: r.balance_after_minor.toString(),
        reference_table: r.reference_table,
        reference_id: r.reference_id,
        created_by: r.created_by,
        created_at: r.created_at.toISOString(),
      })),
    };
  }

  // ─── mutations ─────────────────────────────────────────────────────

  async settle(
    tenantId: string,
    customerId: string,
    actorId: string,
    body: SettleReceivableBody,
    ctx: AuditCtx,
  ): Promise<ApiSettleResult> {
    const amount = body.amount_cents;
    if (amount <= 0n) {
      throw new BadRequestException({
        code: "invalid_payment_amount",
        message: "Amount must be positive",
      });
    }
    if (body.method === "card" && !body.approval_code) {
      throw new BadRequestException({
        code: "approval_code_required",
        message: "approval_code is required for card settlements",
      });
    }

    const { paymentId, ledgerId, newDue } = await basePrisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, TRUE)`,
          tenantId,
        );

        const rows = await tx.$queryRawUnsafe<CustomerLockRow[]>(
          `SELECT id, tenant_id, receivable_balance_minor,
                  receivable_currency_code, deleted_at
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

        const sale = await tx.sale.findFirst({
          where: { id: body.sale_id, deleted_at: null },
          select: {
            id: true,
            customer_id: true,
            balance_due_cents: true,
            currency_code: true,
            payment_status: true,
          },
        });
        if (!sale) {
          throw new NotFoundException({ code: "sale_not_found", message: "Sale not found" });
        }
        if (sale.customer_id !== customerId) {
          throw new BadRequestException({
            code: "customer_mismatch",
            message: "Sale does not belong to this customer",
          });
        }
        if (
          sale.balance_due_cents <= 0n ||
          !["partially_paid", "unpaid"].includes(sale.payment_status)
        ) {
          throw new BadRequestException({
            code: "sale_not_open",
            message: "Sale has no outstanding balance",
          });
        }
        if (amount > sale.balance_due_cents) {
          throw new BadRequestException({
            code: "amount_exceeds_balance",
            message: "Amount exceeds the sale's outstanding balance",
          });
        }
        if (body.method === "cash" && body.cash_tendered_cents! < amount) {
          throw new BadRequestException({
            code: "insufficient_tendered",
            message: "Cash tendered is less than the amount",
          });
        }

        const payment = await tx.salePayment.create({
          data: {
            tenant_id: tenantId,
            sale_id: sale.id,
            method: body.method,
            amount_cents: amount,
            approval_code: body.approval_code ?? null,
            cash_tendered_cents: body.cash_tendered_cents ?? null,
            change_due_cents:
              body.method === "cash" ? body.cash_tendered_cents! - amount : null,
          },
        });

        const newDue = sale.balance_due_cents - amount;
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            balance_due_cents: newDue,
            payment_status: newDue === 0n ? "paid" : "partially_paid",
          },
        });

        const beforeBalance = BigInt(customer.receivable_balance_minor);
        const after = beforeBalance - amount;
        const ledger = await tx.customerReceivableLedger.create({
          data: {
            tenant_id: tenantId,
            customer_id: customerId,
            amount_minor: -amount,
            balance_after_minor: after,
            currency_code: sale.currency_code,
            reference_table: "sale_payment",
            reference_id: payment.id,
            created_by: actorId,
          },
        });
        await tx.customer.update({
          where: { id: customerId },
          data: { receivable_balance_minor: after },
        });

        return {
          paymentId: payment.id,
          ledgerId: ledger.id,
          before: beforeBalance,
          newDue,
          currencyCode: sale.currency_code,
        };
      },
    );

    await this.audit
      .writeTenantScoped(ctx, {
        action: "receivable_settled",
        entity: "sale",
        entityId: body.sale_id,
        before: { balance_due_cents: (newDue + amount).toString() },
        after: {
          balance_due_cents: newDue.toString(),
          amount_cents: amount.toString(),
          method: body.method,
          sale_payment_id: paymentId,
          ledger_id: ledgerId,
          ...(body.approval_code ? { approval_code: maskApprovalCode(body.approval_code) } : {}),
        },
      })
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    const summary = await this.getSummary(tenantId, customerId);
    return { ...summary, sale_payment_id: paymentId };
  }
}

function maskApprovalCode(code: string): string {
  return code.length <= 4 ? code : `••••${code.slice(-4)}`;
}
