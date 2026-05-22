import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { adminPrisma, tenantScoped } from "@madar/db";
import { ImageProcessor, type SupportedMime } from "../common/image/image-processor.service";
import { TenantStorageService, type AllowedMime } from "../common/tenant-storage.service";
import { AuditService } from "../tenant/auth/audit.service";
import { AdminAuditService } from "../admin/auth/admin-audit.service";
import { EmailService } from "../common/email/email.service";
import { getTenantPrimaryRecipient } from "../common/email/recipient.helper";
import { adminPrisma as platformPrisma } from "@madar/db";
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
  ) {}

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

    const created = await tenantScoped(ctx.tenantId).paymentProof.create({
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
    if (proof.status !== "pending") {
      throw new UnprocessableEntityException({
        code: "proof_not_pending",
        message: `Proof is ${proof.status} and cannot be verified`,
      });
    }

    const now = new Date();
    let updatedRow: ProofRow;

    if (proof.context === "sale") {
      // Tenant transaction: update proof + sale together.
      updatedRow = (await tenantScoped(proof.tenant_id).$transaction(async (tx) => {
        const updated = await tx.paymentProof.update({
          where: { id: proofId },
          data: { status: "verified", verified_by: actor.userId, verified_at: now },
        });
        await tx.sale
          .update({
            where: { id: proof.reference_id },
            data: { payment_status: "paid" },
          })
          .catch((e) => {
            this.logger.warn(`sale state sync failed: ${(e as Error).message}`);
          });
        return updated;
      })) as unknown as ProofRow;

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
    } else {
      // Subscription — admin verifier. Update via adminPrisma + invoice sync.
      updatedRow = (await adminPrisma.$transaction(async (tx) => {
        const updated = await tx.paymentProof.update({
          where: { id: proofId },
          data: { status: "verified", verified_by: actor.userId, verified_at: now },
        });
        await tx.subscriptionInvoice
          .update({
            where: { id: proof.reference_id },
            data: { status: "paid", paid_at: now },
          })
          .catch((e) => {
            this.logger.warn(`invoice state sync failed: ${(e as Error).message}`);
          });
        return updated;
      })) as unknown as ProofRow;

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
    const major = Number(invoice.amount_cents) / 100;
    const locale = tenant.default_locale === "ar" ? "ar" : "en";
    const amountFormatted = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: invoice.currency_code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(major);
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
    if (proof.status !== "pending") {
      throw new UnprocessableEntityException({
        code: "proof_not_pending",
        message: `Proof is ${proof.status} and cannot be rejected`,
      });
    }

    const now = new Date();
    let updatedRow: ProofRow;

    if (proof.context === "sale") {
      updatedRow = (await tenantScoped(proof.tenant_id).$transaction(async (tx) => {
        const updated = await tx.paymentProof.update({
          where: { id: proofId },
          data: {
            status: "rejected",
            verified_by: actor.userId,
            verified_at: now,
            rejection_reason: reason,
            notes: notes ?? null,
          },
        });
        await tx.sale
          .update({
            where: { id: proof.reference_id },
            data: { payment_status: "disputed" },
          })
          .catch((e) => {
            this.logger.warn(`sale state sync failed: ${(e as Error).message}`);
          });
        return updated;
      })) as unknown as ProofRow;

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
    } else {
      updatedRow = (await adminPrisma.$transaction(async (tx) => {
        const updated = await tx.paymentProof.update({
          where: { id: proofId },
          data: {
            status: "rejected",
            verified_by: actor.userId,
            verified_at: now,
            rejection_reason: reason,
            notes: notes ?? null,
          },
        });
        await tx.subscriptionInvoice
          .update({
            where: { id: proof.reference_id },
            data: { status: "awaiting_payment" },
          })
          .catch((e) => {
            this.logger.warn(`invoice state sync failed: ${(e as Error).message}`);
          });
        return updated;
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

    return this.toResponse(updatedRow);
  }

  // ─── streamReceipt ─────────────────────────────────────────────────
  async streamReceipt(
    actor: VerifierActor,
    proofId: string,
  ): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    const proof = await this.fetchRow(actor, proofId);
    const buffer = await this.tenantStorage.getObject(proof.receipt_image_url);
    const mime = mimeFromExtension(proof.receipt_image_url);
    const filename = proof.receipt_image_url.split("/").pop() ?? `${proofId}.bin`;
    return { buffer, mime, filename };
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
