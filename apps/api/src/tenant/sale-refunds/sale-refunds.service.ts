import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
// Refunds run inside an interactive transaction so we can SET LOCAL RLS and
// FOR UPDATE the parent sale row. Mirrors the sales-service pattern.
// eslint-disable-next-line no-restricted-imports
import { basePrisma, tenantScoped } from "@madar/db";
import argon2 from "argon2";
import { burnPasswordVerification } from "../../common/timing-safe-auth";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import type { CreateRefundBody } from "./dto/create-refund.dto";
import type { ListRefundsQuery } from "./dto/list-refunds.dto";

const REFUND_CODE_PREFIX = "RFN-";
const REFUND_CODE_RETRIES = 5;
const READ_ROLES = new Set(["owner", "manager", "auditor", "accountant", "cashier"]);
const MANAGER_THRESHOLD_DEFAULT_CENTS = 50_00n; // $50 — override via env.

function refundCode(): string {
  return REFUND_CODE_PREFIX + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * Cumulative proportional allocation: the money owed for refunding `qty` more
 * units of a line whose `pool` cents cover `origQty` units, when `already`
 * units were refunded before. floor(pool·(already+qty)/origQty) −
 * floor(pool·already/origQty) — successive slices always sum to exactly
 * `pool` once every unit is refunded.
 */
function allocateShare(pool: bigint, origQty: number, already: number, qty: number): bigint {
  if (origQty <= 0) return 0n;
  const oq = BigInt(origQty);
  const upTo = (units: bigint) => (pool * units) / oq;
  return upTo(BigInt(already + qty)) - upTo(BigInt(already));
}

export interface ApiSaleRefundLine {
  id: string;
  sale_line_id: string;
  qty: number;
  unit_price_snapshot_cents: string;
  tax_snapshot_cents: string;
  line_total_cents: string;
  restock: boolean;
}

export interface ApiSaleRefundPayment {
  id: string;
  method: string;
  amount_cents: string;
  approval_code: string | null;
  store_credit_ledger_id: string | null;
}

export interface ApiSaleRefund {
  id: string;
  sale_id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  shift_id: string | null;
  customer_id: string | null;
  currency_code: string;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  notes: string | null;
  requires_manager: boolean;
  approved_by_user_id: string | null;
  status: "completed" | "voided";
  occurred_at: string;
  lines: ApiSaleRefundLine[];
  payments: ApiSaleRefundPayment[];
}

@Injectable()
export class SaleRefundsService {
  private readonly logger = new Logger(SaleRefundsService.name);

  constructor(private readonly audit: AuditService) {}

  private managerThreshold(): bigint {
    const fromEnv = process.env.REFUND_MANAGER_THRESHOLD_CENTS;
    if (!fromEnv) return MANAGER_THRESHOLD_DEFAULT_CENTS;
    try {
      return BigInt(fromEnv);
    } catch {
      return MANAGER_THRESHOLD_DEFAULT_CENTS;
    }
  }

  private assertReader(role: string): void {
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Your role can't access refunds",
      });
    }
  }

  // ─── reads ────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    userId: string,
    role: string,
    q: ListRefundsQuery,
  ): Promise<{ items: ApiSaleRefund[]; total: number; page: number; limit: number }> {
    this.assertReader(role);
    const scoped = tenantScoped(tenantId);

    const skip = (q.page - 1) * q.limit;
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.branch_id) where.branch_id = q.branch_id;
    if (q.sale_id) where.sale_id = q.sale_id;
    if (role === "cashier") where.cashier_id = userId;
    if (q.from || q.to) {
      where.occurred_at = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      scoped.saleRefund.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        skip,
        take: q.limit,
        include: { lines: true, payments: true },
      }),
      scoped.saleRefund.count({ where }),
    ]);

    return {
      items: rows.map(this.toDto),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getOne(tenantId: string, role: string, refundId: string): Promise<ApiSaleRefund> {
    this.assertReader(role);
    const scoped = tenantScoped(tenantId);
    const row = await scoped.saleRefund.findUnique({
      where: { id: refundId },
      include: { lines: true, payments: true },
    });
    if (!row || row.deleted_at) {
      throw new NotFoundException({ code: "refund_not_found", message: "Refund not found" });
    }
    return this.toDto(row);
  }

  // ─── mutation ─────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    user: { userId: string; role: string },
    body: CreateRefundBody,
    ctx: AuditCtx,
  ): Promise<ApiSaleRefund> {
    if (!READ_ROLES.has(user.role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Your role can't create a refund",
      });
    }

    // Sum payment slices once up-front so we can short-circuit on mismatch.
    const paymentTotal = body.payments.reduce(
      (sum: bigint, p) => sum + (p.amount_cents as unknown as bigint),
      0n,
    );

    // Pre-flight: store-credit refund requires a customer.
    const hasStoreCredit = body.payments.some((p) => p.method === "store_credit");
    if (hasStoreCredit && !body.customer_id) {
      throw new BadRequestException({
        code: "store_credit_requires_customer",
        message: "Refunding to store credit requires a customer.",
      });
    }
    if (body.payments.some((p) => p.method === "card") && body.payments.find((p) => p.method === "card" && !p.approval_code)) {
      throw new BadRequestException({
        code: "card_approval_code_required",
        message: "Card refunds need a terminal approval code.",
      });
    }

    for (let attempt = 0; attempt < REFUND_CODE_RETRIES; attempt++) {
      const candidate = refundCode();
      try {
        const result = await basePrisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, TRUE)`,
            tenantId,
          );

          // Lock the parent sale row to prevent double-refund races.
          const lockRows = await tx.$queryRawUnsafe<
            Array<{
              id: string;
              tenant_id: string;
              branch_id: string;
              currency_code: string;
              total_cents: bigint;
              refunded_amount_cents: bigint;
              payment_status: string;
            }>
          >(
            `SELECT id, tenant_id, branch_id, currency_code, total_cents,
                    refunded_amount_cents, payment_status
             FROM sales
             WHERE id = $1::uuid AND deleted_at IS NULL
             FOR UPDATE`,
            body.sale_id,
          );
          const sale = lockRows[0];
          if (!sale) {
            throw new NotFoundException({
              code: "sale_not_found",
              message: "Original sale not found",
            });
          }
          if (sale.payment_status === "refunded") {
            throw new ConflictException({
              code: "sale_already_refunded",
              message: "This sale is already fully refunded.",
            });
          }
          // Refunds only against money actually received. A payment_pending or
          // disputed bank-transfer sale was never collected — cash must not
          // leave the drawer for it; resolve the payment proof first.
          if (sale.payment_status !== "paid") {
            throw new UnprocessableEntityException({
              code: "sale_not_paid",
              message: "Only paid sales can be refunded.",
              details: { payment_status: sale.payment_status },
            });
          }

          // Pull sale lines + any prior refund quantities so we can validate
          // the request and snapshot prices/tax.
          const lineLookup = await tx.saleLine.findMany({
            where: { sale_id: body.sale_id, deleted_at: null },
            select: {
              id: true,
              product_id: true,
              qty: true,
              unit_price_cents: true,
              tax_cents: true,
              line_total_cents: true,
            },
          });
          const lineById = new Map(lineLookup.map((l) => [l.id, l]));

          // Was this sale priced tax-inclusive? Derive from the sale itself
          // (not the tenant's *current* setting, which may have changed since):
          // exclusive sales satisfy total = Σline_total + Σtax, inclusive ones
          // total = Σline_total. With zero tax the two are identical.
          const allLineTotal = lineLookup.reduce((s, l) => s + l.line_total_cents, 0n);
          const allTax = lineLookup.reduce((s, l) => s + l.tax_cents, 0n);
          const taxExclusive = allTax > 0n && sale.total_cents === allLineTotal + allTax;

          // How many of each sale_line have already been refunded.
          const priorAgg = await tx.saleRefundLine.groupBy({
            by: ["sale_line_id"],
            _sum: { qty: true },
            where: {
              refund: {
                sale_id: body.sale_id,
                deleted_at: null,
                status: "completed",
              },
            },
          });
          const refundedByLine = new Map<string, number>(
            priorAgg.map((r) => [r.sale_line_id, Number(r._sum.qty ?? 0)]),
          );

          let runningSubtotal = 0n;
          let runningTax = 0n;
          const linesToCreate: Array<{
            sale_line_id: string;
            qty: number;
            unit_price_snapshot_cents: bigint;
            tax_snapshot_cents: bigint;
            line_total_cents: bigint;
            restock: boolean;
            product_id: string;
          }> = [];

          for (const inLine of body.lines) {
            const orig = lineById.get(inLine.sale_line_id);
            if (!orig) {
              throw new UnprocessableEntityException({
                code: "unknown_sale_line",
                message: `Sale line ${inLine.sale_line_id} not on this sale.`,
              });
            }
            const alreadyRefunded = refundedByLine.get(orig.id) ?? 0;
            const remaining = orig.qty - alreadyRefunded;
            if (inLine.qty > remaining) {
              throw new UnprocessableEntityException({
                code: "qty_exceeds_remaining",
                message: `Line ${orig.id} has ${remaining} unit(s) left to refund.`,
                details: { sale_line_id: orig.id, remaining },
              });
            }
            // Refund what the customer actually PAID for these units, from the
            // ORIGINAL sale line: line_total_cents is already net of the line
            // discount (and includes tax when the sale was tax-inclusive).
            // Allocate cumulatively so a full refund across any sequence of
            // partial refunds sums to exactly the line's paid amount — no
            // remainder cents lost to per-unit floor division, no over-refund
            // from using the gross unit price.
            const lineSubtotal = allocateShare(
              orig.line_total_cents,
              orig.qty,
              alreadyRefunded,
              inLine.qty,
            );
            const lineTax = allocateShare(orig.tax_cents, orig.qty, alreadyRefunded, inLine.qty);
            const lineTotal = taxExclusive ? lineSubtotal + lineTax : lineSubtotal;
            runningSubtotal += lineSubtotal;
            runningTax += lineTax;
            linesToCreate.push({
              sale_line_id: orig.id,
              qty: inLine.qty,
              unit_price_snapshot_cents: orig.unit_price_cents,
              tax_snapshot_cents: lineTax,
              line_total_cents: lineTotal,
              restock: inLine.restock ?? true,
              product_id: orig.product_id,
            });
          }
          const refundTotal = taxExclusive ? runningSubtotal + runningTax : runningSubtotal;

          if (paymentTotal !== refundTotal) {
            throw new UnprocessableEntityException({
              code: "refund_total_mismatch",
              message: "Payments total does not match the refunded amount.",
              details: {
                payments_total_cents: paymentTotal.toString(),
                refund_total_cents: refundTotal.toString(),
              },
            });
          }

          // Hard ceiling: cumulative refunds can never exceed what was paid.
          // The per-line allocation already guarantees this for refunds made
          // by this code path; the guard protects sales that carry inflated
          // refund counters from the pre-fix gross-price math.
          if (sale.refunded_amount_cents + refundTotal > sale.total_cents) {
            throw new UnprocessableEntityException({
              code: "refund_exceeds_sale_total",
              message: "Refund would exceed the amount paid for this sale.",
              details: {
                sale_total_cents: sale.total_cents.toString(),
                already_refunded_cents: sale.refunded_amount_cents.toString(),
                refund_total_cents: refundTotal.toString(),
              },
            });
          }

          // Manager-approval gate for cashier-initiated refunds above the
          // threshold. The approver must be an owner or manager of the tenant.
          const threshold = this.managerThreshold();
          const requiresManager = user.role === "cashier" && refundTotal > threshold;
          if (requiresManager) {
            if (!body.approved_by_user_id || !body.approver_password) {
              throw new ForbiddenException({
                code: "manager_approval_required",
                message: "This refund needs a manager's approval (id + password).",
                details: { threshold_cents: threshold.toString() },
              });
            }
            // Approval is a credential, not a UUID: the approver proves
            // presence by entering their own password. A cashier who merely
            // knows a manager's user id must not be able to self-approve.
            const approver = await tx.user.findUnique({
              where: { id: body.approved_by_user_id },
              select: { role: true, deleted_at: true, is_active: true, password_hash: true },
            });
            const eligible =
              approver &&
              !approver.deleted_at &&
              approver.is_active &&
              (approver.role === "owner" || approver.role === "manager");
            const passwordOk = eligible
              ? await argon2
                  .verify(approver.password_hash, body.approver_password)
                  .catch(() => false)
              : (await burnPasswordVerification(body.approver_password), false);
            if (!passwordOk) {
              throw new ForbiddenException({
                code: "invalid_approver",
                message: "Approver credentials are not valid.",
              });
            }
          }

          // Attach to the cashier's current open shift on the sale's branch.
          const openShift = await tx.cashierShift.findFirst({
            where: {
              cashier_id: user.userId,
              branch_id: sale.branch_id,
              status: "open",
              deleted_at: null,
            },
            select: { id: true },
          });

          const refund = await tx.saleRefund.create({
            data: {
              tenant_id: tenantId,
              sale_id: sale.id,
              branch_id: sale.branch_id,
              cashier_id: user.userId,
              shift_id: openShift?.id ?? null,
              customer_id: body.customer_id ?? null,
              code: candidate,
              currency_code: sale.currency_code,
              subtotal_cents: runningSubtotal,
              tax_cents: runningTax,
              total_cents: refundTotal,
              notes: body.notes ?? null,
              requires_manager: requiresManager,
              approved_by_user_id: body.approved_by_user_id ?? null,
              status: "completed",
              created_by: user.userId,
            },
          });

          // Restock + stock_movement per line where restock=true.
          for (const ln of linesToCreate) {
            await tx.saleRefundLine.create({
              data: {
                tenant_id: tenantId,
                refund_id: refund.id,
                sale_line_id: ln.sale_line_id,
                qty: ln.qty,
                unit_price_snapshot_cents: ln.unit_price_snapshot_cents,
                tax_snapshot_cents: ln.tax_snapshot_cents,
                line_total_cents: ln.line_total_cents,
                restock: ln.restock,
              },
            });
            if (ln.restock) {
              await tx.stockMovement.create({
                data: {
                  tenant_id: tenantId,
                  branch_id: sale.branch_id,
                  product_id: ln.product_id,
                  kind: "return_in",
                  qty_delta: ln.qty,
                  reference_table: "sale_refunds",
                  reference_id: refund.id,
                  occurred_at: new Date(),
                  created_by: user.userId,
                },
              });
              await tx.branchStock.upsert({
                where: {
                  tenant_id_branch_id_product_id: {
                    tenant_id: tenantId,
                    branch_id: sale.branch_id,
                    product_id: ln.product_id,
                  },
                },
                create: {
                  tenant_id: tenantId,
                  branch_id: sale.branch_id,
                  product_id: ln.product_id,
                  qty_on_hand: ln.qty,
                  last_movement_at: new Date(),
                  created_by: user.userId,
                },
                update: {
                  qty_on_hand: { increment: ln.qty },
                  last_movement_at: new Date(),
                },
              });
            }
          }

          // Refund payments + store-credit ledger entry when relevant.
          for (const p of body.payments) {
            const amount = p.amount_cents as unknown as bigint;
            let storeCreditLedgerId: string | null = null;
            if (p.method === "store_credit") {
              // Lock the customer row to prevent racing adjusts.
              const locked = await tx.$queryRawUnsafe<
                Array<{
                  id: string;
                  store_credit_balance_minor: bigint;
                  store_credit_currency_code: string | null;
                }>
              >(
                `SELECT id, store_credit_balance_minor, store_credit_currency_code
                 FROM customers WHERE id = $1::uuid AND deleted_at IS NULL FOR UPDATE`,
                body.customer_id!,
              );
              const cust = locked[0];
              if (!cust) {
                throw new UnprocessableEntityException({
                  code: "unknown_customer",
                  message: "Customer not found.",
                });
              }
              if (
                cust.store_credit_currency_code &&
                cust.store_credit_currency_code !== sale.currency_code
              ) {
                throw new BadRequestException({
                  code: "currency_mismatch",
                  message: "Customer's existing store credit is in a different currency.",
                });
              }
              const newBalance = cust.store_credit_balance_minor + amount;
              const ledger = await tx.storeCreditLedger.create({
                data: {
                  tenant_id: tenantId,
                  customer_id: cust.id,
                  amount_minor: amount,
                  balance_after_minor: newBalance,
                  currency_code: sale.currency_code,
                  reference_table: "refund",
                  reference_id: undefined, // back-fill below after refund row exists
                  note_i18n: { en: `Refund ${candidate}`, ar: `استرداد ${candidate}` },
                  created_by: user.userId,
                },
              });
              storeCreditLedgerId = ledger.id;
              await tx.customer.update({
                where: { id: cust.id },
                data: {
                  store_credit_balance_minor: newBalance,
                  store_credit_currency_code: sale.currency_code,
                },
              });
              // Backfill the ledger reference_id now that the refund exists.
              await tx.storeCreditLedger.update({
                where: { id: ledger.id },
                data: { reference_id: refund.id },
              });
            }
            await tx.saleRefundPayment.create({
              data: {
                tenant_id: tenantId,
                refund_id: refund.id,
                method: p.method,
                amount_cents: amount,
                approval_code: p.approval_code ?? null,
                store_credit_ledger_id: storeCreditLedgerId,
              },
            });
          }

          // Update denormalized counter + flip payment_status when fully refunded.
          const newRefunded = sale.refunded_amount_cents + refundTotal;
          const newStatus =
            newRefunded >= sale.total_cents
              ? ("refunded" as const)
              : (sale.payment_status as
                  | "paid"
                  | "payment_pending"
                  | "disputed"
                  | "refunded");
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              refunded_amount_cents: newRefunded,
              payment_status: newStatus,
            },
          });

          return tx.saleRefund.findUniqueOrThrow({
            where: { id: refund.id },
            include: { lines: true, payments: true },
          });
        });

        await this.audit
          .writeTenantScoped(ctx, {
            action: "sale_refunded",
            entity: "sale",
            entityId: result.sale_id,
            after: {
              refund_id: result.id,
              code: result.code,
              total_cents: result.total_cents.toString(),
              line_count: result.lines.length,
              method:
                result.payments.length === 1 ? result.payments[0]!.method : "split",
            },
          })
          .catch((e) =>
            this.logger.warn(`audit write failed: ${(e as Error).message}`),
          );

        return this.toDto(result);
      } catch (err) {
        const code = (err as { code?: string } | undefined)?.code;
        // Unique constraint on (tenant_id, code) — retry with a fresh code.
        if (code === "P2002" && attempt < REFUND_CODE_RETRIES - 1) continue;
        throw err;
      }
    }
    throw new ConflictException({
      code: "refund_code_collision",
      message: "Could not generate a unique refund code; please retry.",
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private toDto = (row: {
    id: string;
    sale_id: string;
    code: string;
    branch_id: string;
    cashier_id: string;
    shift_id: string | null;
    customer_id: string | null;
    currency_code: string;
    subtotal_cents: bigint;
    tax_cents: bigint;
    total_cents: bigint;
    notes: string | null;
    requires_manager: boolean;
    approved_by_user_id: string | null;
    status: "completed" | "voided";
    occurred_at: Date;
    lines: Array<{
      id: string;
      sale_line_id: string;
      qty: number;
      unit_price_snapshot_cents: bigint;
      tax_snapshot_cents: bigint;
      line_total_cents: bigint;
      restock: boolean;
    }>;
    payments: Array<{
      id: string;
      method: string;
      amount_cents: bigint;
      approval_code: string | null;
      store_credit_ledger_id: string | null;
    }>;
  }): ApiSaleRefund => ({
    id: row.id,
    sale_id: row.sale_id,
    code: row.code,
    branch_id: row.branch_id,
    cashier_id: row.cashier_id,
    shift_id: row.shift_id,
    customer_id: row.customer_id,
    currency_code: row.currency_code,
    subtotal_cents: row.subtotal_cents.toString(),
    tax_cents: row.tax_cents.toString(),
    total_cents: row.total_cents.toString(),
    notes: row.notes,
    requires_manager: row.requires_manager,
    approved_by_user_id: row.approved_by_user_id,
    status: row.status,
    occurred_at: row.occurred_at.toISOString(),
    lines: row.lines.map((l) => ({
      id: l.id,
      sale_line_id: l.sale_line_id,
      qty: l.qty,
      unit_price_snapshot_cents: l.unit_price_snapshot_cents.toString(),
      tax_snapshot_cents: l.tax_snapshot_cents.toString(),
      line_total_cents: l.line_total_cents.toString(),
      restock: l.restock,
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount_cents: p.amount_cents.toString(),
      approval_code: p.approval_code,
      store_credit_ledger_id: p.store_credit_ledger_id,
    })),
  });
}
