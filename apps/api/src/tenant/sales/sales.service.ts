import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
// We need cross-statement FOR UPDATE locking for store_credit handling — the
// tenantScoped() $extends wraps each op in its own implicit transaction on
// basePrisma, which routes to a fresh pool connection and releases the lock
// between statements. We drive completeSale's interactive transaction off
// basePrisma directly and SET LOCAL the tenant context once, so RLS still
// filters every row exactly like tenantScoped() would.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, basePrisma, tenantScoped } from "@madar/db";
import { AuditService } from "../auth/audit.service";
import type {
  CreateSaleInput,
  SalePaymentInput,
} from "./dto/create-sale.dto";
import type { ListSalesQuery } from "./dto/list-sales.dto";

interface SaleCtx {
  tenantId: string;
  cashierId: string;
  ip: string;
  userAgent: string;
  impersonatorId?: string;
}

interface ProductSnapshot {
  id: string;
  sku: string;
  name_i18n: unknown;
  price_cents: bigint;
  cost_cents: bigint;
  tax_class_id: string | null;
}

interface PreparedLine {
  product: ProductSnapshot;
  qty: number;
  unit_price_cents: bigint;
  line_discount_cents: bigint;
  line_total_cents: bigint;
  tax_cents: bigint;
  cogs_snapshot_cents: bigint;
  note: string | null;
}

type PaymentMethodLiteral =
  | "cash"
  | "card"
  | "bank_transfer"
  | "store_credit";

interface NormalizedPayment {
  method: PaymentMethodLiteral;
  amount_cents: bigint;
  approval_code?: string;
  cash_tendered_cents?: bigint;
}

interface PersistedPayment extends NormalizedPayment {
  id: string;
  change_due_cents?: bigint;
  store_credit_ledger_id?: string;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private readonly audit: AuditService) {}

  async completeSale(input: CreateSaleInput, ctx: SaleCtx): Promise<SaleResponse> {
    const scoped = tenantScoped(ctx.tenantId);

    // Idempotency on client_uuid — return the existing sale if this UUID has been seen.
    const existing = await this.findByClientUuid(scoped, input.client_uuid);
    if (existing) return existing;

    // Verify branch exists in this tenant (RLS-scoped).
    const branch = await scoped.branch.findUnique({ where: { id: input.branch_id } });
    if (!branch || branch.deleted_at) {
      throw new UnprocessableEntityException({
        code: "unknown_branch",
        message: "Branch not found",
      });
    }

    // Branch authorization. Non-owners may only ring sales at their OWN assigned
    // branch; owners are branch-agnostic (all-access). This stops a cashier
    // pinned to one branch from passing a sibling branch's id to sell against a
    // branch they aren't staffed at. Role + branch are read from the DB (the
    // authoritative source) rather than trusting the JWT claim.
    const actor = await scoped.user.findUnique({
      where: { id: ctx.cashierId },
      select: { role: true, branch_id: true },
    });
    if (actor?.role !== "owner") {
      if (!actor?.branch_id || actor.branch_id !== input.branch_id) {
        throw new ForbiddenException({
          code: "branch_not_allowed",
          message: "You can only sell at your assigned branch.",
        });
      }
    }

    // Load line products + their tax_class_id.
    const productIds = Array.from(new Set(input.lines.map((l) => l.product_id)));
    const products = (await scoped.product.findMany({
      where: { id: { in: productIds }, deleted_at: null, is_active: true },
      select: {
        id: true,
        sku: true,
        name_i18n: true,
        price_cents: true,
        cost_cents: true,
        tax_class_id: true,
      },
    })) as ProductSnapshot[];
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const line of input.lines) {
      if (!productMap.has(line.product_id)) {
        throw new UnprocessableEntityException({
          code: "unknown_product",
          message: `Product not found: ${line.product_id}`,
        });
      }
    }

    // Tax-class resolution (slice 1). `tenants` is a platform table, so it's
    // read via adminPrisma; tax_classes is tenant-scoped, via `scoped`.
    const tenantRow = await adminPrisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { default_tax_class_id: true, tax_inclusive_default: true },
    });
    const inclusive = tenantRow?.tax_inclusive_default ?? false;
    const defaultTaxClassId = tenantRow?.default_tax_class_id ?? null;

    const taxClassIds = new Set<string>();
    for (const p of products) {
      const id = p.tax_class_id ?? defaultTaxClassId;
      if (id) taxClassIds.add(id);
    }
    const taxClasses = taxClassIds.size
      ? await scoped.taxClass.findMany({
          where: { id: { in: Array.from(taxClassIds) }, deleted_at: null },
          select: { id: true, rate_bps: true, is_active: true },
        })
      : [];
    const rateById = new Map<string, number>(
      taxClasses.filter((tc) => tc.is_active).map((tc) => [tc.id, tc.rate_bps]),
    );

    function rateForProduct(p: ProductSnapshot): number {
      const id = p.tax_class_id ?? defaultTaxClassId;
      if (!id) return 0;
      return rateById.get(id) ?? 0;
    }

    // Snapshot prices, compute line totals + per-line tax (slice 1).
    const prepared: PreparedLine[] = input.lines.map((l) => {
      const product = productMap.get(l.product_id)!;
      const qtyBig = BigInt(l.qty);
      const grossLine = product.price_cents * qtyBig;
      const discount = BigInt(l.line_discount_cents);
      const clampedDiscount = discount > grossLine ? grossLine : discount;
      const lineTotal = grossLine - clampedDiscount;
      const cogs = product.cost_cents * qtyBig;
      const rate = rateForProduct(product);
      let lineTax = 0n;
      if (rate > 0) {
        const rateBig = BigInt(rate);
        lineTax = inclusive
          ? (lineTotal * rateBig) / (10_000n + rateBig)
          : (lineTotal * rateBig) / 10_000n;
      }
      return {
        product,
        qty: l.qty,
        unit_price_cents: product.price_cents,
        line_discount_cents: clampedDiscount,
        line_total_cents: lineTotal,
        tax_cents: lineTax,
        cogs_snapshot_cents: cogs,
        note: l.note ?? null,
      };
    });

    const subtotalCents = prepared.reduce(
      (sum, l) => sum + (l.line_total_cents + l.line_discount_cents),
      0n,
    );
    const discountCents = prepared.reduce((sum, l) => sum + l.line_discount_cents, 0n);
    const taxCents = prepared.reduce((sum, l) => sum + l.tax_cents, 0n);
    const totalCents = inclusive
      ? subtotalCents - discountCents
      : subtotalCents - discountCents + taxCents;

    // ── normalize payments[] (slice 5 chassis) ───────────────────────
    const payments = normalizePayments(input, totalCents);
    const sumCents = payments.reduce((acc, p) => acc + p.amount_cents, 0n);
    if (sumCents !== totalCents) {
      throw new BadRequestException({
        code: "split_total_mismatch",
        message: `Sum of payments (${sumCents}) does not equal total (${totalCents})`,
      });
    }

    // Pre-validate (cheap checks, fail fast before opening the tx).
    for (const p of payments) {
      if (p.amount_cents <= 0n) {
        throw new BadRequestException({
          code: "invalid_payment_amount",
          message: "Payment amount must be positive",
        });
      }
      if (p.method === "cash") {
        if (p.cash_tendered_cents == null) {
          throw new BadRequestException({
            code: "cash_tendered_required",
            message: "cash_tendered_cents required for cash payment",
          });
        }
        if (p.cash_tendered_cents < p.amount_cents) {
          throw new BadRequestException({
            code: "insufficient_tendered",
            message: "Cash tendered is less than slice amount",
          });
        }
      }
      if (p.method === "card") {
        if (!p.approval_code || p.approval_code.length < 4 || p.approval_code.length > 20) {
          throw new BadRequestException({
            code: "approval_code_required",
            message: "approval_code (4–20 chars) required for card payment",
          });
        }
      }
      if (p.method === "store_credit" && !input.customer_id) {
        throw new BadRequestException({
          code: "customer_required",
          message: "A customer must be attached to use store credit",
        });
      }
    }

    const anyBankTransfer = payments.some((p) => p.method === "bank_transfer");
    const derivedMethod = payments.length >= 2 ? "split" : payments[0]!.method;
    const derivedStatus: "paid" | "payment_pending" = anyBankTransfer ? "payment_pending" : "paid";

    // For receipt convenience: persist Sale.approval_code only when there is
    // exactly one card payment (legacy/non-split shape).
    const singleCardCode =
      payments.length === 1 && payments[0]!.method === "card"
        ? (payments[0]!.approval_code ?? null)
        : null;

    // Offline-aware fields. client_occurred_at is clamped to now() — cashiers
    // can't book in the future no matter what their device clock says.
    const now = new Date();
    let saleOccurredAt = now;
    if (input.client_occurred_at) {
      const parsed = new Date(input.client_occurred_at);
      if (!isNaN(parsed.getTime()) && parsed <= now) {
        saleOccurredAt = parsed;
      }
    }
    const offlineCompleted = input.offline_completed ?? false;

    // ── interactive transaction (basePrisma + SET LOCAL for FOR UPDATE) ──
    let saleId: string | null = null;
    let saleCode: string | null = null;
    let persistedPayments: PersistedPayment[] = [];
    let hasNegativeStock = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateSaleCode();
      try {
        const created = await basePrisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, TRUE)`,
            ctx.tenantId,
          );

          // Attach to the cashier's open shift on the same branch when one
          // exists. Sales without a shift still complete — back-compat with
          // any caller that hasn't opened a shift yet.
          const openShift = await tx.cashierShift.findFirst({
            where: {
              cashier_id: ctx.cashierId,
              branch_id: input.branch_id,
              status: "open",
              deleted_at: null,
            },
            select: { id: true },
          });

          const sale = await tx.sale.create({
            data: {
              tenant_id: ctx.tenantId,
              branch_id: input.branch_id,
              code: candidate,
              cashier_id: ctx.cashierId,
              customer_id: input.customer_id,
              shift_id: openShift?.id ?? null,
              subtotal_cents: subtotalCents,
              discount_cents: discountCents,
              tax_cents: taxCents,
              total_cents: totalCents,
              currency_code: input.currency_code,
              payment_method: derivedMethod,
              payment_status: derivedStatus,
              approval_code: singleCardCode,
              client_uuid: input.client_uuid,
              client_sequence: input.client_sequence,
              client_occurred_at: input.client_occurred_at
                ? new Date(input.client_occurred_at)
                : null,
              has_negative_stock: false,
              offline_completed: offlineCompleted,
              occurred_at: saleOccurredAt,
              created_by: ctx.cashierId,
            },
          });

          // Sale lines.
          for (const line of prepared) {
            await tx.saleLine.create({
              data: {
                tenant_id: ctx.tenantId,
                sale_id: sale.id,
                product_id: line.product.id,
                qty: line.qty,
                unit_price_cents: line.unit_price_cents,
                discount_cents: line.line_discount_cents,
                tax_cents: line.tax_cents,
                line_total_cents: line.line_total_cents,
                cogs_snapshot_cents: line.cogs_snapshot_cents,
                note_i18n: line.note ? { en: line.note } : undefined,
              },
            });
          }

          // Inventory commits regardless of payment status (CLAUDE.md).
          for (const line of prepared) {
            await tx.stockMovement.create({
              data: {
                tenant_id: ctx.tenantId,
                branch_id: input.branch_id,
                product_id: line.product.id,
                kind: "sale",
                qty_delta: -line.qty,
                unit_cost_cents: line.product.cost_cents,
                reference_table: "sales",
                reference_id: sale.id,
                created_by: ctx.cashierId,
              },
            });
            await tx.branchStock.upsert({
              where: {
                tenant_id_branch_id_product_id: {
                  tenant_id: ctx.tenantId,
                  branch_id: input.branch_id,
                  product_id: line.product.id,
                },
              },
              update: {
                qty_on_hand: { decrement: line.qty },
                last_movement_at: new Date(),
              },
              create: {
                tenant_id: ctx.tenantId,
                branch_id: input.branch_id,
                product_id: line.product.id,
                qty_on_hand: -line.qty,
                last_movement_at: new Date(),
                created_by: ctx.cashierId,
              },
            });
          }

          // Negative-stock detection (offline-POS slice). The upsert above may
          // have driven qty_on_hand below zero — CLAUDE.md says the sale
          // completes anyway but the manager gets a sync_conflicts row to
          // review. One row per offending line. Sale.has_negative_stock is
          // flipped so the receipt UI can badge it.
          const negativeLines: Array<{ product_id: string; qty_on_hand_after: number }> = [];
          for (const line of prepared) {
            const row = await tx.branchStock.findUnique({
              where: {
                tenant_id_branch_id_product_id: {
                  tenant_id: ctx.tenantId,
                  branch_id: input.branch_id,
                  product_id: line.product.id,
                },
              },
              select: { qty_on_hand: true },
            });
            if (row && row.qty_on_hand < 0) {
              negativeLines.push({
                product_id: line.product.id,
                qty_on_hand_after: row.qty_on_hand,
              });
            }
          }

          if (negativeLines.length > 0) {
            await tx.sale.update({
              where: { id: sale.id },
              data: { has_negative_stock: true },
            });
            for (const neg of negativeLines) {
              await tx.syncConflict.create({
                data: {
                  tenant_id: ctx.tenantId,
                  conflict_kind: "negative_stock",
                  reference_table: "sales",
                  reference_id: sale.id,
                  details: {
                    product_id: neg.product_id,
                    qty_on_hand_after: neg.qty_on_hand_after,
                    offline_completed: offlineCompleted,
                  },
                  occurred_at: saleOccurredAt,
                },
              });
            }
          }

          // Payment slices (slice 5 loop, with store_credit handling per slice 4).
          const persisted: PersistedPayment[] = [];
          for (const p of payments) {
            let storeCreditLedgerId: string | undefined;
            let changeDue: bigint | undefined;

            if (p.method === "cash" && p.cash_tendered_cents != null) {
              changeDue = p.cash_tendered_cents - p.amount_cents;
            }

            if (p.method === "store_credit") {
              // FOR UPDATE the customer row. Same connection as the rest of the
              // tx thanks to basePrisma.$transaction + SET LOCAL above.
              const rows = await tx.$queryRawUnsafe<
                {
                  id: string;
                  tenant_id: string;
                  store_credit_balance_minor: bigint;
                  store_credit_currency_code: string | null;
                  deleted_at: Date | null;
                }[]
              >(
                `SELECT id, tenant_id, store_credit_balance_minor,
                        store_credit_currency_code, deleted_at
                 FROM customers
                 WHERE id = $1::uuid
                 FOR UPDATE`,
                input.customer_id!,
              );
              const customer = rows[0];
              if (!customer || customer.deleted_at || customer.tenant_id !== ctx.tenantId) {
                throw new UnprocessableEntityException({
                  code: "unknown_customer",
                  message: "Customer not found",
                });
              }
              if (
                customer.store_credit_currency_code &&
                customer.store_credit_currency_code !== input.currency_code
              ) {
                throw new BadRequestException({
                  code: "currency_mismatch",
                  message: "Customer store-credit currency does not match this sale",
                });
              }
              const beforeBalance = BigInt(customer.store_credit_balance_minor);
              if (beforeBalance < p.amount_cents) {
                throw new BadRequestException({
                  code: "insufficient_balance",
                  message: "Customer's store credit does not cover this payment",
                });
              }
              const afterBalance = beforeBalance - p.amount_cents;
              const ledger = await tx.storeCreditLedger.create({
                data: {
                  tenant_id: ctx.tenantId,
                  customer_id: input.customer_id!,
                  amount_minor: -p.amount_cents,
                  balance_after_minor: afterBalance,
                  currency_code: input.currency_code,
                  reference_table: "sale",
                  reference_id: sale.id,
                  created_by: ctx.cashierId,
                },
              });
              await tx.customer.update({
                where: { id: input.customer_id! },
                data: { store_credit_balance_minor: afterBalance },
              });
              storeCreditLedgerId = ledger.id;
            }

            const created = await tx.salePayment.create({
              data: {
                tenant_id: ctx.tenantId,
                sale_id: sale.id,
                method: p.method,
                amount_cents: p.amount_cents,
                approval_code: p.approval_code ?? null,
                cash_tendered_cents: p.cash_tendered_cents ?? null,
                change_due_cents: changeDue ?? null,
                store_credit_ledger_id: storeCreditLedgerId ?? null,
              },
            });

            persisted.push({
              ...p,
              id: created.id,
              ...(changeDue !== undefined ? { change_due_cents: changeDue } : {}),
              ...(storeCreditLedgerId ? { store_credit_ledger_id: storeCreditLedgerId } : {}),
            });
          }

          return { sale, persisted, negativeStock: negativeLines.length > 0 };
        });
        saleId = created.sale.id;
        saleCode = created.sale.code;
        persistedPayments = created.persisted;
        hasNegativeStock = created.negativeStock;
        break;
      } catch (err) {
        // Prisma P2002 unique violation on (tenant_id, code) → retry with a new code.
        const code = (err as { code?: string } | undefined)?.code;
        if (code === "P2002") continue;
        throw err;
      }
    }
    if (!saleId || !saleCode) {
      throw new ConflictException({
        code: "sale_code_collision",
        message: "Failed to allocate a unique sale code — please retry",
      });
    }

    // Audit log (out of transaction; failure here is logged, not fatal).
    await this.audit
      .writeTenantScoped(
        {
          tenantId: ctx.tenantId,
          userId: ctx.cashierId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
        },
        {
          action: "sale_completed",
          entity: "sale",
          entityId: saleId,
          after: {
            code: saleCode,
            payment_method: derivedMethod,
            payment_status: derivedStatus,
            total_cents: totalCents.toString(),
            tax_cents: taxCents.toString(),
            line_count: prepared.length,
            has_negative_stock: hasNegativeStock,
            offline_completed: offlineCompleted,
            ...(singleCardCode
              ? { approval_code_last4: singleCardCode.slice(-4) }
              : {}),
            payments: persistedPayments.map((p) => ({
              method: p.method,
              amount_cents: p.amount_cents.toString(),
              ...(p.approval_code
                ? { approval_code: maskApprovalCode(p.approval_code) }
                : {}),
            })),
          },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    // Echo cash totals for the receipt UI: sum across cash slices.
    const cashSlice = persistedPayments.find((p) => p.method === "cash");
    const cashTenderedCents =
      cashSlice?.cash_tendered_cents != null ? cashSlice.cash_tendered_cents.toString() : null;
    const changeDueCents =
      cashSlice?.change_due_cents != null ? cashSlice.change_due_cents.toString() : null;

    const response = await this.findOne(scoped, saleId);
    response.cash_tendered_cents = cashTenderedCents;
    response.change_due_cents = changeDueCents;
    response.payments = persistedPayments.map((p) => ({
      id: p.id,
      method: p.method,
      amount_cents: p.amount_cents.toString(),
      approval_code_last4: p.approval_code ? p.approval_code.slice(-4) : null,
      cash_tendered_cents: p.cash_tendered_cents?.toString() ?? null,
      change_due_cents: p.change_due_cents?.toString() ?? null,
      store_credit_ledger_id: p.store_credit_ledger_id ?? null,
    }));
    return response;
  }

  async getSale(tenantId: string, saleId: string): Promise<SaleResponse> {
    const scoped = tenantScoped(tenantId);
    return this.findOne(scoped, saleId);
  }

  async list(
    tenantId: string,
    callerId: string,
    role: string,
    q: ListSalesQuery,
  ): Promise<{
    items: SaleSummary[];
    total: number;
    page: number;
    limit: number;
  }> {
    const scoped = tenantScoped(tenantId);

    const skip = (q.page - 1) * q.limit;
    const where: Record<string, unknown> = { deleted_at: null };
    if (q.branch_id) where.branch_id = q.branch_id;
    if (q.customer_id) where.customer_id = q.customer_id;
    if (q.payment_method) where.payment_method = q.payment_method;
    if (q.payment_status) where.payment_status = q.payment_status;
    if (role === "cashier") where.cashier_id = callerId;
    if (q.from || q.to) {
      where.occurred_at = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      scoped.sale.findMany({
        where,
        orderBy: { occurred_at: "desc" },
        skip,
        take: q.limit,
        select: {
          id: true,
          code: true,
          branch_id: true,
          cashier_id: true,
          customer_id: true,
          occurred_at: true,
          subtotal_cents: true,
          tax_cents: true,
          total_cents: true,
          refunded_amount_cents: true,
          currency_code: true,
          payment_method: true,
          payment_status: true,
        },
      }),
      scoped.sale.count({ where }),
    ]);

    const saleIds = rows.map((r) => r.id);
    const branchIds = Array.from(new Set(rows.map((r) => r.branch_id)));
    const cashierIds = Array.from(new Set(rows.map((r) => r.cashier_id)));

    const [branches, cashiers, lineCounts] = await Promise.all([
      branchIds.length === 0
        ? []
        : scoped.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, code: true },
          }),
      cashierIds.length === 0
        ? []
        : scoped.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          }),
      saleIds.length === 0
        ? []
        : scoped.saleLine.groupBy({
            by: ["sale_id"],
            where: { sale_id: { in: saleIds } },
            _count: { _all: true },
          }),
    ]);
    const branchById = new Map(branches.map((b) => [b.id, b.code]));
    const cashierById = new Map(cashiers.map((u) => [u.id, u.name]));
    const lineCountBySale = new Map(
      lineCounts.map((r) => [r.sale_id, r._count._all]),
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        branch_id: r.branch_id,
        branch_code: branchById.get(r.branch_id) ?? "",
        cashier_id: r.cashier_id,
        cashier_name: cashierById.get(r.cashier_id) ?? null,
        customer_id: r.customer_id,
        occurred_at: r.occurred_at.toISOString(),
        subtotal_cents: r.subtotal_cents.toString(),
        tax_cents: r.tax_cents.toString(),
        total_cents: r.total_cents.toString(),
        refunded_amount_cents: r.refunded_amount_cents.toString(),
        currency_code: r.currency_code,
        payment_method: r.payment_method as SaleSummary["payment_method"],
        payment_status: r.payment_status as SaleSummary["payment_status"],
        line_count: lineCountBySale.get(r.id) ?? 0,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async getSaleForReceipt(tenantId: string, saleId: string): Promise<ReceiptResponse> {
    const scoped = tenantScoped(tenantId);
    const sale = await this.findOne(scoped, saleId);

    const [tenant, branch, cashier, bankAccount] = await Promise.all([
      (await import("@madar/db")).adminPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          name_i18n: true,
          logo_url: true,
          legal_name: true,
          tax_registration_number: true,
        },
      }),
      scoped.branch.findUnique({
        where: { id: sale.branch_id },
        select: { code: true, name_i18n: true, address_i18n: true },
      }),
      scoped.user.findUnique({
        where: { id: sale.cashier_id },
        select: { name: true },
      }),
      // For split sales with a bank_transfer slice, surface the default account
      // (same as for legacy single bank_transfer sales).
      this.hasBankTransfer(sale)
        ? scoped.tenantBankAccount
            .findFirst({
              where: {
                is_default: true,
                is_active: true,
                deleted_at: null,
                branch_id: sale.branch_id,
              },
              select: {
                bank_name: true,
                account_holder: true,
                account_number_last4: true,
                iban_last4: true,
                swift: true,
              },
            })
            .then((override) =>
              override
                ? override
                : scoped.tenantBankAccount.findFirst({
                    where: { is_default: true, is_active: true, deleted_at: null, branch_id: null },
                    select: {
                      bank_name: true,
                      account_holder: true,
                      account_number_last4: true,
                      iban_last4: true,
                      swift: true,
                    },
                  }),
            )
        : Promise.resolve(null),
    ]);

    if (!tenant) {
      throw new NotFoundException({ code: "tenant_not_found", message: "Tenant not found" });
    }

    return {
      sale,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        name_i18n: tenant.name_i18n as { en: string; ar: string },
        logo_url: tenant.logo_url,
        legal_name: tenant.legal_name,
        tax_registration_number: tenant.tax_registration_number,
      },
      branch: branch
        ? {
            code: branch.code,
            name_i18n: branch.name_i18n as { en: string; ar: string },
            address_i18n: (branch.address_i18n as { en?: string; ar?: string } | null) ?? null,
          }
        : null,
      cashier: cashier ? { name: cashier.name } : null,
      bank_account: bankAccount
        ? {
            bank_name: bankAccount.bank_name,
            account_holder: bankAccount.account_holder,
            account_number_last4: bankAccount.account_number_last4,
            iban_last4: bankAccount.iban_last4,
            swift: bankAccount.swift,
          }
        : null,
    };
  }

  private hasBankTransfer(sale: SaleResponse): boolean {
    if (sale.payment_method === "bank_transfer") return true;
    return (sale.payments ?? []).some((p) => p.method === "bank_transfer");
  }

  private async findOne(
    scoped: ReturnType<typeof tenantScoped>,
    saleId: string,
  ): Promise<SaleResponse> {
    const sale = await scoped.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: true,
        payments: true,
      },
    });
    if (!sale) {
      throw new NotFoundException({ code: "sale_not_found", message: "Sale not found" });
    }
    const productIds = Array.from(new Set(sale.lines.map((l) => l.product_id)));
    const products = await scoped.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name_i18n: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return {
      id: sale.id,
      code: sale.code,
      branch_id: sale.branch_id,
      cashier_id: sale.cashier_id,
      customer_id: sale.customer_id,
      occurred_at: sale.occurred_at.toISOString(),
      subtotal_cents: sale.subtotal_cents.toString(),
      discount_cents: sale.discount_cents.toString(),
      tax_cents: sale.tax_cents.toString(),
      total_cents: sale.total_cents.toString(),
      cash_tendered_cents: null,
      change_due_cents: null,
      currency_code: sale.currency_code,
      payment_method: sale.payment_method as SaleResponse["payment_method"],
      payment_status: sale.payment_status as SaleResponse["payment_status"],
      approval_code: sale.approval_code,
      client_uuid: sale.client_uuid,
      client_occurred_at: sale.client_occurred_at?.toISOString() ?? null,
      has_negative_stock: sale.has_negative_stock,
      offline_completed: sale.offline_completed,
      lines: sale.lines.map((l) => {
        const p = productMap.get(l.product_id);
        return {
          id: l.id,
          product_id: l.product_id,
          sku: p?.sku ?? "",
          name_i18n: (p?.name_i18n ?? { en: "", ar: "" }) as { en: string; ar: string },
          qty: l.qty,
          unit_price_cents: l.unit_price_cents.toString(),
          discount_cents: l.discount_cents.toString(),
          tax_cents: l.tax_cents.toString(),
          line_total_cents: l.line_total_cents.toString(),
          cogs_snapshot_cents: l.cogs_snapshot_cents.toString(),
          note: (l.note_i18n as { en?: string } | null)?.en ?? null,
        };
      }),
      payments: sale.payments.map((p) => ({
        id: p.id,
        method: p.method as PaymentMethodLiteral,
        amount_cents: p.amount_cents.toString(),
        approval_code_last4: p.approval_code ? p.approval_code.slice(-4) : null,
        cash_tendered_cents: p.cash_tendered_cents?.toString() ?? null,
        change_due_cents: p.change_due_cents?.toString() ?? null,
        store_credit_ledger_id: p.store_credit_ledger_id ?? null,
      })),
    };
  }

  private async findByClientUuid(
    scoped: ReturnType<typeof tenantScoped>,
    clientUuid: string,
  ): Promise<SaleResponse | null> {
    const sale = await scoped.sale.findFirst({ where: { client_uuid: clientUuid } });
    if (!sale) return null;
    return this.findOne(scoped, sale.id);
  }
}

function maskApprovalCode(code: string): string {
  return code.length <= 4 ? code : `••••${code.slice(-4)}`;
}

function normalizePayments(input: CreateSaleInput, totalCents: bigint): NormalizedPayment[] {
  if (input.payments && input.payments.length > 0) {
    return input.payments.map((p: SalePaymentInput) => ({
      method: p.method,
      amount_cents: BigInt(p.amount_cents),
      ...(p.approval_code !== undefined ? { approval_code: p.approval_code } : {}),
      ...(p.cash_tendered_cents !== undefined
        ? { cash_tendered_cents: BigInt(p.cash_tendered_cents) }
        : {}),
    }));
  }
  const method = input.payment_method!;
  const legacy: NormalizedPayment = {
    method,
    amount_cents: totalCents,
  };
  if (input.cash_tendered_cents != null) {
    legacy.cash_tendered_cents = BigInt(input.cash_tendered_cents);
  }
  if (input.approval_code) legacy.approval_code = input.approval_code;
  return [legacy];
}

function generateSaleCode(): string {
  const bytes = randomUUID().replace(/-/g, "");
  const num = parseInt(bytes.slice(0, 8), 16);
  return `TX-${num.toString(36).toUpperCase().padStart(6, "0")}`;
}

export interface SaleLineResponse {
  id: string;
  product_id: string;
  sku: string;
  name_i18n: { en: string; ar: string };
  qty: number;
  unit_price_cents: string;
  discount_cents: string;
  tax_cents: string;
  line_total_cents: string;
  cogs_snapshot_cents: string;
  note: string | null;
}

export interface SalePaymentResponse {
  id: string;
  method: PaymentMethodLiteral;
  amount_cents: string;
  approval_code_last4: string | null;
  cash_tendered_cents: string | null;
  change_due_cents: string | null;
  store_credit_ledger_id: string | null;
}

export interface ReceiptResponse {
  sale: SaleResponse;
  tenant: {
    id: string;
    name: string;
    name_i18n: { en: string; ar: string };
    logo_url: string | null;
    legal_name: string | null;
    tax_registration_number: string | null;
  };
  branch: {
    code: string;
    name_i18n: { en: string; ar: string };
    address_i18n: { en?: string; ar?: string } | null;
  } | null;
  cashier: { name: string } | null;
  bank_account: {
    bank_name: string;
    account_holder: string;
    account_number_last4: string;
    iban_last4: string | null;
    swift: string | null;
  } | null;
}

export interface SaleSummary {
  id: string;
  code: string;
  branch_id: string;
  branch_code: string;
  cashier_id: string;
  cashier_name: string | null;
  customer_id: string | null;
  occurred_at: string;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  refunded_amount_cents: string;
  currency_code: string;
  payment_method:
    | "cash"
    | "card"
    | "bank_transfer"
    | "store_credit"
    | "split";
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  line_count: number;
}

export interface SaleResponse {
  id: string;
  code: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  occurred_at: string;
  subtotal_cents: string;
  discount_cents: string;
  tax_cents: string;
  total_cents: string;
  cash_tendered_cents: string | null;
  change_due_cents: string | null;
  currency_code: string;
  payment_method:
    | "cash"
    | "card"
    | "bank_transfer"
    | "store_credit"
    | "split";
  payment_status: "paid" | "payment_pending" | "disputed" | "refunded";
  approval_code: string | null;
  client_uuid: string;
  client_occurred_at: string | null;
  has_negative_stock: boolean;
  offline_completed: boolean;
  lines: SaleLineResponse[];
  payments: SalePaymentResponse[];
}
