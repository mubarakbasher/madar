import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { adminPrisma, tenantScoped } from "@madar/db";
import { withAdminTx, withTenantTx, type Tx } from "../shared/db-tx";
import { ImageProcessor, type SupportedMime } from "../common/image/image-processor.service";
import { TenantStorageService, type AllowedMime } from "../common/tenant-storage.service";
import { AuditService } from "../tenant/auth/audit.service";
import { AdminAuditService } from "../admin/auth/admin-audit.service";
import { EmailService } from "../common/email/email.service";
import { RedisService } from "../common/redis.service";
import { formatMoney } from "../common/currency";
import { getTenantStatus, invalidateTenantStatus } from "../tenant/auth/tenant-status.cache";
import { getTenantPrimaryRecipient } from "../common/email/recipient.helper";
import { adminPrisma as platformPrisma } from "@madar/db";
import { loadEnv } from "../env";
import type {
  ListProofsQuery,
  ListProofsResponse,
  ProofResponse,
  SubmitProofCtx,
  SubmitProofInput,
  VerifierActor,
} from "./proof.types";

// Payment-proof receipts: jpg / png / pdf. Detected via magic bytes by the
// shared TenantStorageService. Kept as a typed list so the ImageProcessor
// SupportedMime contract stays satisfied below.
const ALLOWED_MIMES: ReadonlyArray<AllowedMime> = ["image/jpeg", "image/png", "application/pdf"];
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

interface ProofRow {
  id: string;
  tenant_id: string;
  context: string;
  reference_id: string;
  amount_cents: bigint;
  currency_code: string;
  bank_account_kind: string;
  bank_account_id: string;
  payer_name: string;
  payer_bank: string | null;
  transfer_date: Date;
  transfer_reference: string | null;
  receipt_image_url: string;
  status: string;
  verified_by: string | null;
  verified_at: Date | null;
  rejection_reason: string | null;
  notes: string | null;
  previous_proof_id: string | null;
  info_requested_message: string | null;
  info_requested_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PaymentProofsService {
  private readonly logger = new Logger(PaymentProofsService.name);

  constructor(
    private readonly tenantStorage: TenantStorageService,
    private readonly imageProcessor: ImageProcessor,
    private readonly tenantAudit: AuditService,
    private readonly adminAudit: AdminAuditService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Suspended/cancelled tenants are read-only. The auth guard allowlists the
   * whole /v1/payment-proofs prefix so they can still pay their subscription
   * invoice — but SALE-context proof mutations change sales.payment_status
   * and must stay blocked. Enforced here because only the service knows the
   * proof's context.
   */
  private async assertSaleProofWritable(tenantId: string): Promise<void> {
    const status = await getTenantStatus(tenantId, this.redis);
    if (status === "suspended" || status === "cancelled") {
      throw new HttpException(
        {
          code: "tenant_suspended",
          message: "Subscription suspended — sale payment proofs are read-only.",
          status,
        },
        423,
      );
    }
  }

  // ─── submit ────────────────────────────────────────────────────────
  async submit(
    input: SubmitProofInput,
    ctx: SubmitProofCtx,
    file: { buffer: Buffer; declaredMime: string; originalName: string },
  ): Promise<ProofResponse> {
    // Size check is enforced at the Multer layer; defense in depth here.
    // We check the original (pre-preprocess) buffer because that's what the
    // tenant actually uploaded and what the user-facing limit refers to.
    if (file.buffer.length > MAX_RECEIPT_BYTES) {
      throw new BadRequestException({
        code: "file_too_large",
        message: "Receipt must be 5MB or smaller",
      });
    }

    // MIME detection via magic bytes (declared MIME is untrusted). We do this
    // BEFORE preprocessing so we know whether to push the buffer through
    // ImageProcessor or pass it through as a PDF. The shared TenantStorageService
    // re-validates magic-bytes on the post-process buffer for defense in depth.
    const detected = await fileTypeFromBuffer(file.buffer);
    const detectedMime = detected?.mime ?? "";
    if (!ALLOWED_MIMES.includes(detectedMime as AllowedMime)) {
      throw new BadRequestException({
        code: "file_mime_unsupported",
        message: "Receipt must be JPG, PNG, or PDF",
      });
    }
    const mime = detectedMime as SupportedMime;

    // Suspended tenants may still submit SUBSCRIPTION proofs (that's how they
    // get unsuspended) but not sale-context ones.
    if (input.context === "sale") {
      await this.assertSaleProofWritable(ctx.tenantId);
    }

    // Validate the reference exists and is in this tenant.
    await this.assertReferenceExists(ctx.tenantId, input);

    // Validate bank account.
    await this.assertBankAccountExists(ctx.tenantId, input);

    // Process the bytes (resize + EXIF strip for images, pass-through PDF).
    // Image preprocess is receipt-specific and stays here — supplier-documents
    // and other future callers may store originals.
    const processed = await this.imageProcessor.process(file.buffer, mime);

    // Mint proof id up-front so we can store at the final path before insert.
    const proofId = randomUUID();
    const { key: relPath } = await this.tenantStorage.putTenantObject(
      {
        tenantId: ctx.tenantId,
        prefix: "payment-proofs",
        fileId: proofId,
        ext: processed.ext,
        contentType: processed.mime,
        buffer: processed.buffer,
      },
      {
        allowedMimes: ALLOWED_MIMES,
        maxBytes: MAX_RECEIPT_BYTES,
      },
    );

    const created = await withTenantTx(ctx.tenantId, async (tx) => {
      const row = await tx.paymentProof.create({
        data: {
          id: proofId,
          tenant_id: ctx.tenantId,
          context: input.context,
          reference_id: input.reference_id,
          amount_cents: input.amount_cents,
          currency_code: input.currency_code,
          bank_account_kind: input.bank_account_kind,
          bank_account_id: input.bank_account_id,
          payer_name: input.payer_name,
          payer_bank: input.payer_bank ?? null,
          transfer_date: new Date(input.transfer_date),
          transfer_reference: input.transfer_reference,
          receipt_image_url: relPath,
          status: "pending",
          created_by: ctx.userId,
        },
      });
      if (input.context === "subscription") {
        // The invoice now has a receipt awaiting human verification — move it
        // to in_review so the daily lifecycle tick stops counting days past
        // due. Without this, a tenant who paid on time would keep advancing
        // toward suspension purely from verification lag.
        await tx.subscriptionInvoice.updateMany({
          where: {
            id: input.reference_id,
            status: { in: ["awaiting_payment", "overdue"] },
          },
          data: { status: "in_review" },
        });
      } else {
        // Back-link this proof to the sale_payment it evidences, so a later
        // rejection can find the exact payment to reverse (a receivable
        // settlement, or the original POS bank-transfer payment) instead of
        // guessing by sale + method.
        if (input.sale_payment_id) {
          // Caller disambiguated explicitly — validate it belongs to this
          // sale/tenant, is a bank-transfer payment, and isn't already
          // linked to a different proof.
          const claimed = await tx.salePayment.updateMany({
            where: {
              id: input.sale_payment_id,
              tenant_id: ctx.tenantId,
              sale_id: input.reference_id,
              method: "bank_transfer",
              payment_proof_id: null,
            },
            data: { payment_proof_id: proofId },
          });
          if (claimed.count === 0) {
            throw new UnprocessableEntityException({
              code: "invalid_sale_payment",
              message:
                "sale_payment_id does not match an unlinked bank-transfer payment on this sale",
            });
          }
        } else {
          // No explicit choice — only safe to auto-link when the sale has
          // exactly one unlinked bank-transfer payment. Two (e.g. the
          // original POS payment plus a later settlement, both awaiting
          // proof) is ambiguous and must not be guessed at via created_at
          // ordering.
          const unlinkedPayments = await tx.salePayment.findMany({
            where: {
              tenant_id: ctx.tenantId,
              sale_id: input.reference_id,
              method: "bank_transfer",
              payment_proof_id: null,
            },
            select: { id: true },
            take: 2,
          });
          if (unlinkedPayments.length === 1) {
            await tx.salePayment.update({
              where: { id: unlinkedPayments[0]!.id },
              data: { payment_proof_id: proofId },
            });
          } else if (unlinkedPayments.length > 1) {
            throw new UnprocessableEntityException({
              code: "ambiguous_payment",
              message:
                "This sale has more than one payment awaiting a receipt — pass sale_payment_id to disambiguate",
            });
          }
          // Zero unlinked payments: no link (current/prior behavior).
        }
      }
      return row;
    });

    // Tenant audit. (Submission always writes to tenant audit because the
    // tenant submitted it. Verification audits are realm-correct — see verify().)
    await this.tenantAudit
      .writeTenantScoped(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
        },
        {
          action: "payment_proof_submitted",
          entity: "payment_proof",
          entityId: created.id,
          after: {
            context: input.context,
            reference_id: input.reference_id,
            amount_cents: input.amount_cents.toString(),
            bank_account_kind: input.bank_account_kind,
          },
        },
      )
      .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

    return this.toResponse(created as unknown as ProofRow);
  }

  // ─── list ──────────────────────────────────────────────────────────
  async list(actor: VerifierActor, query: ListProofsQuery): Promise<ListProofsResponse> {
    const where: Record<string, unknown> = {
      ...(query.context ? { context: query.context } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    if (actor.realm === "tenant") {
      // tenantScoped already filters by tenant; the explicit tenant_id below is
      // belt-and-braces. tenantId is non-null for tenant realm.
      where.tenant_id = actor.tenantId;
    } else if (query.tenantId) {
      where.tenant_id = query.tenantId;
    }

    const skip = (query.page - 1) * query.limit;
    const client = actor.realm === "tenant" ? tenantScoped(actor.tenantId!) : adminPrisma;
    const [rows, total] = await Promise.all([
      client.paymentProof.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: query.limit,
      }),
      client.paymentProof.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r as unknown as ProofRow)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  // ─── getOne ────────────────────────────────────────────────────────
  async getOne(actor: VerifierActor, proofId: string): Promise<ProofResponse> {
    const row = await this.fetchRow(actor, proofId);
    return this.toResponse(row);
  }

  // ─── verify ────────────────────────────────────────────────────────
  async verify(
    actor: VerifierActor,
    proofId: string,
    allowedContexts: Array<"sale" | "subscription">,
  ): Promise<ProofResponse> {
    const proof = await this.fetchRow(actor, proofId);
    this.assertContext(proof, allowedContexts);
    if (proof.context === "sale" && actor.realm === "tenant") {
      await this.assertSaleProofWritable(proof.tenant_id);
    }
    if (proof.status !== "pending") {
      throw new UnprocessableEntityException({
        code: "proof_not_pending",
        message: `Proof is ${proof.status} and cannot be verified`,
      });
    }

    const now = new Date();
    let updatedRow: ProofRow;
    let resettled: {
      saleId: string;
      newDueCents: bigint;
      newStatus: "paid" | "partially_paid";
      salePaymentId: string;
      amountCents: bigint;
    } | null = null;

    if (proof.context === "sale") {
      // One real transaction: proof + sale move together or not at all. The
      // status conditions in both UPDATEs make concurrent verify/reject lose
      // cleanly (0 rows -> 409) instead of double-verifying or regressing a
      // refunded sale back to paid.
      const txResult = await withTenantTx(proof.tenant_id, async (tx) => {
        const claimed = await tx.paymentProof.updateMany({
          where: { id: proofId, status: "pending" },
          data: { status: "verified", verified_by: actor.userId, verified_at: now },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: "proof_state_changed",
            message: "Proof was decided by someone else — reload and review.",
          });
        }

        // If this proof is back-linked to a settlement payment whose balance
        // was reopened by an earlier rejection (net ledger movement for that
        // payment is back to zero, most recent row positive), verifying the
        // resubmitted proof must re-close it. This is a distinct path from
        // the payment_pending/disputed → paid transition below: a
        // settlement's sale never carries payment_status "payment_pending".
        let resettledInTx: typeof resettled = null;
        const payment = await tx.salePayment.findFirst({
          where: { tenant_id: proof.tenant_id, payment_proof_id: proofId },
        });
        if (payment) {
          const ledgerRows = await tx.customerReceivableLedger.findMany({
            where: {
              tenant_id: proof.tenant_id,
              reference_table: "sale_payment",
              reference_id: payment.id,
            },
            orderBy: { created_at: "desc" },
          });
          const wasReversed = ledgerRows.length > 0 && ledgerRows[0]!.amount_minor > 0n;
          if (wasReversed) {
            // Lock the customer row FIRST — before re-reading the sale — so a
            // concurrent settle() (which locks the customer first too, per
            // its own ordering) can't commit its balance decrement in between
            // our sale read and our write and get silently overwritten by
            // stale math computed from a sale row we read too early.
            const sale0 = await tx.sale.findUnique({ where: { id: payment.sale_id } });
            if (sale0 && sale0.customer_id) {
              const custRows = await tx.$queryRawUnsafe<
                Array<{ id: string; receivable_balance_minor: bigint }>
              >(
                `SELECT id, receivable_balance_minor FROM customers WHERE id = $1::uuid FOR UPDATE`,
                sale0.customer_id,
              );
              const customer = custRows[0];
              // Re-read the sale AFTER acquiring the customer lock — a
              // concurrent settle() holding/waiting on the same customer lock
              // may have changed balance_due_cents between our first read and
              // now.
              const sale = await tx.sale.findUnique({ where: { id: payment.sale_id } });
              if (customer && sale && sale.customer_id) {
                if (sale.balance_due_cents < payment.amount_cents) {
                  // A concurrent settlement already re-covered enough of the
                  // balance that resettling this proof's amount on top would
                  // overshoot — distinct from "sale gone/refunded" below so
                  // the verifier UI can explain exactly what happened.
                  throw new ConflictException({
                    code: "settlement_already_covered",
                    message:
                      "Another payment already covered this balance — review the sale before deciding.",
                  });
                }

                const newDue = sale.balance_due_cents - payment.amount_cents;
                const newStatus = newDue === 0n ? "paid" : "partially_paid";
                await tx.sale.update({
                  where: { id: sale.id },
                  data: { balance_due_cents: newDue, payment_status: newStatus },
                });

                const beforeCustBalance = BigInt(customer.receivable_balance_minor);
                const afterCustBalance = beforeCustBalance - payment.amount_cents;
                await tx.customerReceivableLedger.create({
                  data: {
                    tenant_id: proof.tenant_id,
                    customer_id: sale.customer_id,
                    amount_minor: -payment.amount_cents,
                    balance_after_minor: afterCustBalance,
                    currency_code: sale.currency_code,
                    reference_table: "sale_payment",
                    reference_id: payment.id,
                    created_by: actor.userId,
                  },
                });
                await tx.customer.update({
                  where: { id: sale.customer_id },
                  data: { receivable_balance_minor: afterCustBalance },
                });

                resettledInTx = {
                  saleId: sale.id,
                  newDueCents: newDue,
                  newStatus,
                  salePaymentId: payment.id,
                  amountCents: payment.amount_cents,
                };
              }
            }
          }
        }

        if (!resettledInTx) {
          const saleSync = await tx.sale.updateMany({
            where: {
              id: proof.reference_id,
              payment_status: { in: ["payment_pending", "disputed"] },
            },
            data: { payment_status: "paid" },
          });
          if (saleSync.count === 0) {
            // Sale gone or no longer awaiting payment (e.g. refunded since
            // the proof was uploaded) — verifying this proof would corrupt
            // state.
            throw new ConflictException({
              code: "sale_state_changed",
              message: "The sale is no longer awaiting payment — review it before deciding.",
            });
          }
        }

        const proofRow = await tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
        return { proofRow, resettledInTx };
      });
      updatedRow = txResult.proofRow as unknown as ProofRow;
      resettled = txResult.resettledInTx;

      await this.tenantAudit
        .writeTenantScoped(
          {
            tenantId: proof.tenant_id,
            userId: actor.userId,
            ip: actor.ip,
            userAgent: actor.userAgent,
            ...(actor.impersonatorId ? { impersonatorId: actor.impersonatorId } : {}),
          },
          {
            action: "payment_proof_verified",
            entity: "payment_proof",
            entityId: proofId,
            after: { status: "verified", sale_id: proof.reference_id },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

      if (resettled) {
        const resettledResult = resettled;
        await this.tenantAudit
          .writeTenantScoped(
            {
              tenantId: proof.tenant_id,
              userId: actor.userId,
              ip: actor.ip,
              userAgent: actor.userAgent,
              ...(actor.impersonatorId ? { impersonatorId: actor.impersonatorId } : {}),
            },
            {
              action: "receivable_resettled",
              entity: "sale",
              entityId: resettledResult.saleId,
              after: {
                sale_payment_id: resettledResult.salePaymentId,
                amount_cents: resettledResult.amountCents.toString(),
                balance_due_cents: resettledResult.newDueCents.toString(),
                payment_status: resettledResult.newStatus,
                reason: "payment_proof_verified",
                payment_proof_id: proofId,
              },
            },
          )
          .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      }

      // Fire-and-forget sale-verified email to tenant owner.
      void this.sendSaleVerifiedEmail(proof.tenant_id, proof, now).catch((e) =>
        this.logger.warn(`sale payment_received email failed: ${(e as Error).message}`),
      );
    } else {
      // Subscription — admin verifier. Same guarded-transition rules.
      updatedRow = (await withAdminTx(async (tx) => {
        const claimed = await tx.paymentProof.updateMany({
          where: { id: proofId, status: "pending" },
          data: { status: "verified", verified_by: actor.userId, verified_at: now },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: "proof_state_changed",
            message: "Proof was decided by someone else — reload and review.",
          });
        }
        const invoiceSync = await tx.subscriptionInvoice.updateMany({
          where: {
            id: proof.reference_id,
            status: { in: ["awaiting_payment", "in_review", "overdue"] },
          },
          data: { status: "paid", paid_at: now },
        });
        if (invoiceSync.count === 0) {
          throw new ConflictException({
            code: "invoice_state_changed",
            message: "The invoice is no longer awaiting payment — review it before deciding.",
          });
        }
        // The lifecycle tick only ever moves FORWARD (grace → suspended →
        // cancelled); paying must be the road back. When this was the last
        // unpaid invoice, restore the tenant to active. A successful payment at
        // any stage before archival reactivates the shop, so cancelled is
        // included here alongside grace_period/suspended.
        const unpaidLeft = await tx.subscriptionInvoice.count({
          where: {
            tenant_id: proof.tenant_id,
            status: { in: ["awaiting_payment", "in_review", "overdue"] },
            deleted_at: null,
          },
        });
        if (unpaidLeft === 0) {
          await tx.tenant.updateMany({
            where: {
              id: proof.tenant_id,
              status: { in: ["grace_period", "suspended", "cancelled"] },
            },
            data: { status: "active" },
          });
        }
        return tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
      })) as unknown as ProofRow;

      // Drop the cached status so a just-restored tenant regains write
      // access immediately instead of after the 30s cache TTL.
      await invalidateTenantStatus(proof.tenant_id, this.redis).catch((e) =>
        this.logger.warn(`tenant-status cache invalidate failed: ${(e as Error).message}`),
      );

      await this.adminAudit
        .write(
          { platformUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent },
          {
            action: "admin_proof_verified",
            targetTenantId: proof.tenant_id,
            targetEntity: "payment_proof",
            targetId: proofId,
            metadata: { context: proof.context, reference_id: proof.reference_id },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

      // Fire-and-forget payment_received email to the tenant owner.
      void this.sendPaymentReceivedEmail(proof.tenant_id, proof.reference_id, now).catch((e) =>
        this.logger.warn(`payment_received email failed: ${(e as Error).message}`),
      );
    }

    return this.toResponse(updatedRow);
  }

  private async sendPaymentReceivedEmail(
    tenantId: string,
    invoiceId: string,
    paidAt: Date,
  ): Promise<void> {
    const [recipient, invoice, tenant] = await Promise.all([
      getTenantPrimaryRecipient(tenantId),
      platformPrisma.subscriptionInvoice.findUnique({
        where: { id: invoiceId },
        select: { reference_code: true, amount_cents: true, currency_code: true },
      }),
      platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, default_locale: true },
      }),
    ]);
    if (!recipient || !invoice || !tenant) return;
    const locale = tenant.default_locale === "ar" ? "ar" : "en";
    const amountFormatted = formatMoney(
      invoice.amount_cents,
      invoice.currency_code,
      locale === "ar" ? "ar-EG" : "en-US",
    );
    await this.email.send({
      template: "payment_received",
      to: recipient.email,
      locale,
      vars: {
        tenantName: tenant.name,
        referenceCode: invoice.reference_code,
        amountFormatted,
        paidAt: paidAt.toISOString().slice(0, 10),
      },
    });
  }

  private async sendSaleVerifiedEmail(
    tenantId: string,
    proof: ProofRow,
    paidAt: Date,
  ): Promise<void> {
    const [recipient, tenant] = await Promise.all([
      getTenantPrimaryRecipient(tenantId),
      platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, default_locale: true },
      }),
    ]);
    if (!recipient || !tenant) return;
    const locale = tenant.default_locale === "ar" ? "ar" : "en";
    const amountFormatted = formatMoney(
      proof.amount_cents,
      proof.currency_code,
      locale === "ar" ? "ar-EG" : "en-US",
    );
    await this.email.send({
      template: "payment_received",
      to: recipient.email,
      locale,
      vars: {
        tenantName: tenant.name,
        referenceCode: proof.reference_id.slice(0, 8),
        amountFormatted,
        paidAt: paidAt.toISOString().slice(0, 10),
      },
    });
  }

  private async sendPaymentRejectedEmail(
    tenantId: string,
    proof: ProofRow,
    reason: string,
  ): Promise<void> {
    const [recipient, tenant] = await Promise.all([
      getTenantPrimaryRecipient(tenantId),
      platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, default_locale: true },
      }),
    ]);
    if (!recipient || !tenant) return;
    const locale = tenant.default_locale === "ar" ? "ar" : "en";
    const amountFormatted = formatMoney(
      proof.amount_cents,
      proof.currency_code,
      locale === "ar" ? "ar-EG" : "en-US",
    );
    const env = loadEnv();
    await this.email.send({
      template: "payment_proof_rejected",
      to: recipient.email,
      locale,
      vars: {
        tenantName: tenant.name,
        amountFormatted,
        rejectionReason: reason,
        resubmitUrl: `${env.TENANT_WEB_ORIGIN}/${locale}/billing`,
      },
    });
  }

  private async sendInfoRequestedEmail(
    tenantId: string,
    proof: ProofRow,
    message: string,
  ): Promise<void> {
    const [recipient, tenant] = await Promise.all([
      getTenantPrimaryRecipient(tenantId),
      platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, default_locale: true },
      }),
    ]);
    if (!recipient || !tenant) return;
    const locale = tenant.default_locale === "ar" ? "ar" : "en";
    const amountFormatted = formatMoney(
      proof.amount_cents,
      proof.currency_code,
      locale === "ar" ? "ar-EG" : "en-US",
    );
    const env = loadEnv();
    await this.email.send({
      template: "payment_proof_info_requested",
      to: recipient.email,
      locale,
      vars: {
        tenantName: tenant.name,
        amountFormatted,
        message,
        proofUrl: `${env.TENANT_WEB_ORIGIN}/${locale}/billing`,
      },
    });
  }

  // ─── reject ────────────────────────────────────────────────────────
  async reject(
    actor: VerifierActor,
    proofId: string,
    allowedContexts: Array<"sale" | "subscription">,
    reason: string,
    notes?: string | null,
  ): Promise<ProofResponse> {
    const proof = await this.fetchRow(actor, proofId);
    this.assertContext(proof, allowedContexts);
    if (proof.context === "sale" && actor.realm === "tenant") {
      await this.assertSaleProofWritable(proof.tenant_id);
    }
    if (proof.status !== "pending") {
      throw new UnprocessableEntityException({
        code: "proof_not_pending",
        message: `Proof is ${proof.status} and cannot be rejected`,
      });
    }

    const now = new Date();
    let updatedRow: ProofRow;
    let reopened: {
      saleId: string;
      restoredDueCents: bigint;
      newStatus: "partially_paid" | "unpaid";
      salePaymentId: string;
      amountCents: bigint;
    } | null = null;

    if (proof.context === "sale") {
      const txResult = await withTenantTx(proof.tenant_id, async (tx) => {
        const claimed = await tx.paymentProof.updateMany({
          where: { id: proofId, status: "pending" },
          data: {
            status: "rejected",
            verified_by: actor.userId,
            verified_at: now,
            rejection_reason: reason,
            notes: notes ?? null,
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: "proof_state_changed",
            message: "Proof was decided by someone else — reload and review.",
          });
        }
        // Only a sale still awaiting this payment becomes disputed; a sale
        // that was paid/refunded since must not regress.
        await tx.sale.updateMany({
          where: { id: proof.reference_id, payment_status: "payment_pending" },
          data: { payment_status: "disputed" },
        });

        // If this proof evidences a receivable settlement (a sale_payment
        // back-linked at submit time, with a matching negative ledger row),
        // rejecting it must reopen the balance it closed. Append-only: a
        // reversing positive ledger row, never an edit to the original.
        let reopenedInTx: typeof reopened = null;
        const payment = await tx.salePayment.findFirst({
          where: { tenant_id: proof.tenant_id, payment_proof_id: proofId },
        });
        if (payment) {
          const ledgerRow = await tx.customerReceivableLedger.findFirst({
            where: {
              tenant_id: proof.tenant_id,
              reference_table: "sale_payment",
              reference_id: payment.id,
            },
            orderBy: { created_at: "desc" },
          });
          // Only a currently-open settlement (most recent movement negative,
          // i.e. still reducing the balance) is something to reopen. If the
          // most recent row is already a positive reversal, this settlement
          // was already reopened — a stray/duplicate reject must not double
          // it up.
          if (ledgerRow && ledgerRow.amount_minor < 0n) {
            // Lock the customer row FIRST (matches settle()'s ordering in
            // receivables.service.ts), then re-read the sale — a concurrent
            // settle() waiting on the same customer lock could otherwise
            // commit its balance change in between our sale read and our
            // write, and this reopen's math would silently clobber it.
            const sale0 = await tx.sale.findUnique({ where: { id: payment.sale_id } });
            if (sale0 && sale0.customer_id) {
              const custRows = await tx.$queryRawUnsafe<
                Array<{ id: string; receivable_balance_minor: bigint }>
              >(
                `SELECT id, receivable_balance_minor FROM customers WHERE id = $1::uuid FOR UPDATE`,
                sale0.customer_id,
              );
              const customer = custRows[0];
              const sale = await tx.sale.findUnique({ where: { id: payment.sale_id } });
              if (customer && sale && sale.customer_id) {
                // Reverse exactly what the settlement ledger row moved, not
                // the payment's face amount — defensively self-consistent
                // even if the two were ever to diverge.
                const settledAmount =
                  ledgerRow.amount_minor < 0n ? -ledgerRow.amount_minor : ledgerRow.amount_minor;
                const rawDue = sale.balance_due_cents + settledAmount;
                const restoredDue = rawDue > sale.total_cents ? sale.total_cents : rawDue;
                const newStatus = restoredDue === sale.total_cents ? "unpaid" : "partially_paid";
                await tx.sale.update({
                  where: { id: sale.id },
                  data: { balance_due_cents: restoredDue, payment_status: newStatus },
                });

                const beforeCustBalance = BigInt(customer.receivable_balance_minor);
                const afterCustBalance = beforeCustBalance + settledAmount;
                await tx.customerReceivableLedger.create({
                  data: {
                    tenant_id: proof.tenant_id,
                    customer_id: sale.customer_id,
                    amount_minor: settledAmount,
                    balance_after_minor: afterCustBalance,
                    currency_code: sale.currency_code,
                    reference_table: "sale_payment",
                    reference_id: payment.id,
                    created_by: actor.userId,
                  },
                });
                await tx.customer.update({
                  where: { id: sale.customer_id },
                  data: { receivable_balance_minor: afterCustBalance },
                });

                reopenedInTx = {
                  saleId: sale.id,
                  restoredDueCents: restoredDue,
                  newStatus,
                  salePaymentId: payment.id,
                  amountCents: settledAmount,
                };
              }
            }
          }
        }

        const proofRow = await tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
        return { proofRow, reopenedInTx };
      });
      updatedRow = txResult.proofRow as unknown as ProofRow;
      reopened = txResult.reopenedInTx;

      await this.tenantAudit
        .writeTenantScoped(
          {
            tenantId: proof.tenant_id,
            userId: actor.userId,
            ip: actor.ip,
            userAgent: actor.userAgent,
            ...(actor.impersonatorId ? { impersonatorId: actor.impersonatorId } : {}),
          },
          {
            action: "payment_proof_rejected",
            entity: "payment_proof",
            entityId: proofId,
            after: { status: "rejected", rejection_reason: reason, sale_id: proof.reference_id },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));

      if (reopened) {
        const reopenedResult = reopened;
        await this.tenantAudit
          .writeTenantScoped(
            {
              tenantId: proof.tenant_id,
              userId: actor.userId,
              ip: actor.ip,
              userAgent: actor.userAgent,
              ...(actor.impersonatorId ? { impersonatorId: actor.impersonatorId } : {}),
            },
            {
              action: "receivable_reopened",
              entity: "sale",
              entityId: reopenedResult.saleId,
              after: {
                sale_payment_id: reopenedResult.salePaymentId,
                amount_cents: reopenedResult.amountCents.toString(),
                balance_due_cents: reopenedResult.restoredDueCents.toString(),
                payment_status: reopenedResult.newStatus,
                reason: "payment_proof_rejected",
                payment_proof_id: proofId,
              },
            },
          )
          .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
      }
    } else {
      updatedRow = (await withAdminTx(async (tx) => {
        const claimed = await tx.paymentProof.updateMany({
          where: { id: proofId, status: "pending" },
          data: {
            status: "rejected",
            verified_by: actor.userId,
            verified_at: now,
            rejection_reason: reason,
            notes: notes ?? null,
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: "proof_state_changed",
            message: "Proof was decided by someone else — reload and review.",
          });
        }
        // in_review → awaiting_payment so the tenant can resubmit. An overdue
        // invoice stays overdue (the due date governs), and a paid or
        // cancelled invoice is left untouched.
        await tx.subscriptionInvoice.updateMany({
          where: { id: proof.reference_id, status: "in_review" },
          data: { status: "awaiting_payment" },
        });
        return tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
      })) as unknown as ProofRow;

      await this.adminAudit
        .write(
          { platformUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent },
          {
            action: "admin_proof_rejected",
            targetTenantId: proof.tenant_id,
            targetEntity: "payment_proof",
            targetId: proofId,
            reason,
            metadata: { context: proof.context, reference_id: proof.reference_id },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    // Fire-and-forget rejection email to tenant owner.
    void this.sendPaymentRejectedEmail(proof.tenant_id, proof, reason).catch((e) =>
      this.logger.warn(`payment_rejected email failed: ${(e as Error).message}`),
    );

    return this.toResponse(updatedRow);
  }

  // ─── resubmit ─────────────────────────────────────────────────────
  async resubmit(
    actor: VerifierActor,
    originalProofId: string,
    file: { buffer: Buffer; declaredMime: string; originalName: string },
    ctx: SubmitProofCtx,
    opts?: { restrictToSubmitter?: string },
  ): Promise<ProofResponse> {
    const original = await this.fetchRow(actor, originalProofId);
    if (original.context === "sale" && actor.realm === "tenant") {
      await this.assertSaleProofWritable(original.tenant_id);
    }
    // Non-verifier roles may only resubmit their own rejected proof —
    // resubmission cancels the original and so mutates the verification
    // chain of custody.
    if (opts?.restrictToSubmitter && original.created_by !== opts.restrictToSubmitter) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only the original submitter or a verifier can resubmit this proof",
      });
    }
    if (original.status !== "rejected") {
      throw new UnprocessableEntityException({
        code: "proof_not_resubmittable",
        message: `Only rejected proofs can be resubmitted (current: ${original.status})`,
      });
    }

    // Size check (defense in depth).
    if (file.buffer.length > MAX_RECEIPT_BYTES) {
      throw new BadRequestException({
        code: "file_too_large",
        message: "Receipt must be 5MB or smaller",
      });
    }

    // MIME detection via magic bytes.
    const detected = await fileTypeFromBuffer(file.buffer);
    const detectedMime = detected?.mime ?? "";
    if (!ALLOWED_MIMES.includes(detectedMime as AllowedMime)) {
      throw new BadRequestException({
        code: "file_mime_unsupported",
        message: "Receipt must be JPG, PNG, or PDF",
      });
    }
    const mime = detectedMime as SupportedMime;

    // Process (resize + EXIF strip for images, pass-through PDF).
    const processed = await this.imageProcessor.process(file.buffer, mime);

    // Mint new proof id and store the receipt.
    const proofId = randomUUID();
    const { key: relPath } = await this.tenantStorage.putTenantObject(
      {
        tenantId: original.tenant_id,
        prefix: "payment-proofs",
        fileId: proofId,
        ext: processed.ext,
        contentType: processed.mime,
        buffer: processed.buffer,
      },
      {
        allowedMimes: ALLOWED_MIMES,
        maxBytes: MAX_RECEIPT_BYTES,
      },
    );

    // Transaction: cancel original + create new proof linked to original.
    // The status guard makes concurrent resubmits of the same rejection lose
    // cleanly instead of attaching two fresh pending proofs to one reference.
    const runTx = <T>(fn: (tx: Tx) => Promise<T>) =>
      original.context === "sale" ? withTenantTx(original.tenant_id, fn) : withAdminTx(fn);

    const created = await runTx(async (tx) => {
      const cancelled = await tx.paymentProof.updateMany({
        where: { id: originalProofId, status: "rejected" },
        data: { status: "cancelled", updated_at: new Date() },
      });
      if (cancelled.count === 0) {
        throw new ConflictException({
          code: "proof_state_changed",
          message: "This rejection was already resubmitted or cancelled.",
        });
      }

      if (original.context === "subscription") {
        // A fresh receipt is back in the verification queue — pause the
        // lifecycle clock again (mirrors submit()).
        await tx.subscriptionInvoice.updateMany({
          where: {
            id: original.reference_id,
            status: { in: ["awaiting_payment", "overdue"] },
          },
          data: { status: "in_review" },
        });
      }

      // Create replacement proof copying key fields from the original.
      const replacement = await tx.paymentProof.create({
        data: {
          id: proofId,
          tenant_id: original.tenant_id,
          context: original.context as "sale" | "subscription",
          reference_id: original.reference_id,
          amount_cents: original.amount_cents,
          currency_code: original.currency_code,
          bank_account_kind: original.bank_account_kind as "tenant" | "platform",
          bank_account_id: original.bank_account_id,
          payer_name: original.payer_name,
          payer_bank: original.payer_bank,
          transfer_date: original.transfer_date,
          transfer_reference: original.transfer_reference,
          receipt_image_url: relPath,
          status: "pending",
          previous_proof_id: originalProofId,
          created_by: ctx.userId,
        },
      });

      if (original.context === "sale") {
        // The cancelled/rejected original proof may have been back-linked to
        // a sale_payments row at submit time (see submit()). That link would
        // otherwise strand the receivable pointing at a dead proof — carry it
        // forward to the replacement so a later verify()/reject() of THIS
        // proof can still find the settlement it evidences.
        await tx.salePayment.updateMany({
          where: { tenant_id: original.tenant_id, payment_proof_id: originalProofId },
          data: { payment_proof_id: proofId },
        });
      }

      return replacement;
    });

    // Audit: resubmission.
    if (actor.realm === "tenant") {
      await this.tenantAudit
        .writeTenantScoped(
          {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            ...(ctx.impersonatorId ? { impersonatorId: ctx.impersonatorId } : {}),
          },
          {
            action: "payment_proof_resubmitted",
            entity: "payment_proof",
            entityId: proofId,
            after: { original_id: originalProofId, new_id: proofId },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    } else {
      await this.adminAudit
        .write(
          { platformUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent },
          {
            action: "admin_proof_resubmitted",
            targetTenantId: original.tenant_id,
            targetEntity: "payment_proof",
            targetId: proofId,
            metadata: { original_id: originalProofId, new_id: proofId },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    return this.toResponse(created as unknown as ProofRow);
  }

  // ─── requestMoreInfo ──────────────────────────────────────────────
  async requestMoreInfo(
    actor: VerifierActor,
    proofId: string,
    message: string,
  ): Promise<ProofResponse> {
    const proof = await this.fetchRow(actor, proofId);
    if (proof.context === "sale" && actor.realm === "tenant") {
      await this.assertSaleProofWritable(proof.tenant_id);
    }
    if (proof.status !== "pending") {
      throw new UnprocessableEntityException({
        code: "proof_not_pending",
        message: `Only pending proofs can have info requested (current: ${proof.status})`,
      });
    }

    const now = new Date();
    const client = actor.realm === "tenant" ? tenantScoped(proof.tenant_id) : adminPrisma;
    const updated = await client.paymentProof.update({
      where: { id: proofId },
      data: {
        info_requested_message: message,
        info_requested_at: now,
        updated_at: now,
      },
    });

    // Audit.
    const auditAction = actor.realm === "tenant"
      ? "payment_proof_info_requested"
      : "admin_proof_info_requested";
    if (actor.realm === "tenant") {
      await this.tenantAudit
        .writeTenantScoped(
          {
            tenantId: proof.tenant_id,
            userId: actor.userId,
            ip: actor.ip,
            userAgent: actor.userAgent,
            ...(actor.impersonatorId ? { impersonatorId: actor.impersonatorId } : {}),
          },
          {
            action: auditAction,
            entity: "payment_proof",
            entityId: proofId,
            after: { message },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    } else {
      await this.adminAudit
        .write(
          { platformUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent },
          {
            action: auditAction,
            targetTenantId: proof.tenant_id,
            targetEntity: "payment_proof",
            targetId: proofId,
            metadata: { message },
          },
        )
        .catch((e) => this.logger.warn(`audit write failed: ${(e as Error).message}`));
    }

    // Fire-and-forget info-requested email to tenant owner.
    void this.sendInfoRequestedEmail(proof.tenant_id, proof, message).catch((e) =>
      this.logger.warn(`info_requested email failed: ${(e as Error).message}`),
    );

    return this.toResponse(updated as unknown as ProofRow);
  }

  // ─── streamReceipt ─────────────────────────────────────────────────
  async streamReceipt(
    actor: VerifierActor,
    proofId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const proof = await this.fetchRow(actor, proofId);
    const buffer = await this.tenantStorage.getObjectOrNull(proof.receipt_image_url);
    if (!buffer) {
      throw new NotFoundException({
        code: "receipt_not_found",
        message: "Receipt file is missing from storage",
      });
    }
    const mime = mimeFromExtension(proof.receipt_image_url);
    const filename = proof.receipt_image_url.split("/").pop() ?? `${proofId}.bin`;
    return { buffer, mime, filename };
  }

  // ─── signedReceiptUrl ─────────────────────────────────────────────
  async signedReceiptUrl(
    actor: VerifierActor,
    proofId: string,
    ttlSeconds: number,
  ): Promise<string> {
    const proof = await this.fetchRow(actor, proofId);
    return this.tenantStorage.signedUrl(proof.receipt_image_url, ttlSeconds);
  }

  // ─── helpers ───────────────────────────────────────────────────────
  private async fetchRow(actor: VerifierActor, proofId: string): Promise<ProofRow> {
    const client = actor.realm === "tenant" ? tenantScoped(actor.tenantId!) : adminPrisma;
    const proof = await client.paymentProof.findUnique({ where: { id: proofId } });
    if (!proof) {
      throw new NotFoundException({ code: "proof_not_found", message: "Proof not found" });
    }
    return proof as unknown as ProofRow;
  }

  private assertContext(
    proof: ProofRow,
    allowed: Array<"sale" | "subscription">,
  ): void {
    if (!allowed.includes(proof.context as "sale" | "subscription")) {
      throw new ForbiddenException({
        code: "wrong_realm",
        message: `This proof belongs to the ${proof.context} flow and cannot be acted on here`,
      });
    }
  }

  private async assertReferenceExists(tenantId: string, input: SubmitProofInput): Promise<void> {
    const scoped = tenantScoped(tenantId);
    if (input.context === "sale") {
      const sale = await scoped.sale.findUnique({ where: { id: input.reference_id } });
      if (!sale || sale.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_sale",
          message: "Sale not found for this tenant",
        });
      }
    } else {
      const inv = await scoped.subscriptionInvoice.findUnique({ where: { id: input.reference_id } });
      if (!inv || inv.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_invoice",
          message: "Subscription invoice not found for this tenant",
        });
      }
    }
  }

  private async assertBankAccountExists(tenantId: string, input: SubmitProofInput): Promise<void> {
    if (input.bank_account_kind === "tenant") {
      const acct = await tenantScoped(tenantId).tenantBankAccount.findUnique({
        where: { id: input.bank_account_id },
      });
      if (!acct || acct.deleted_at) {
        throw new UnprocessableEntityException({
          code: "unknown_bank_account",
          message: "Bank account not found for this tenant",
        });
      }
    } else {
      const acct = await adminPrisma.platformBankAccount.findUnique({
        where: { id: input.bank_account_id },
      });
      if (!acct) {
        throw new UnprocessableEntityException({
          code: "unknown_bank_account",
          message: "Platform bank account not found",
        });
      }
    }
  }

  private toResponse(row: ProofRow): ProofResponse {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      context: row.context as "sale" | "subscription",
      reference_id: row.reference_id,
      amount_cents: row.amount_cents.toString(),
      currency_code: row.currency_code,
      bank_account_kind: row.bank_account_kind as "tenant" | "platform",
      bank_account_id: row.bank_account_id,
      payer_name: row.payer_name,
      payer_bank: row.payer_bank,
      transfer_date: row.transfer_date.toISOString().slice(0, 10),
      transfer_reference: row.transfer_reference,
      receipt_url: `/v1/payment-proofs/${row.id}/receipt`,
      status: row.status as "pending" | "verified" | "rejected" | "cancelled",
      verified_by: row.verified_by,
      verified_at: row.verified_at?.toISOString() ?? null,
      rejection_reason: row.rejection_reason,
      notes: row.notes,
      previous_proof_id: row.previous_proof_id,
      info_requested_message: row.info_requested_message,
      info_requested_at: row.info_requested_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}

function mimeFromExtension(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
