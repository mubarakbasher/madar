/**
 * Send-PO-email BullMQ processor.
 *
 * Triggered by the PO controller after `Send` is pressed. Loads the PO +
 * supplier + branch + tenant via `adminPrisma`, renders the PO PDF, and
 * dispatches an email with the PDF as an attachment.
 *
 * Why `adminPrisma`: the email job is asynchronous and runs outside any
 * tenant request context, so there's no `app.current_tenant_id` to lean on.
 * The job's `tenantId` payload is treated as authoritative: every query is
 * filtered by it explicitly, and any mismatch with the PO's `tenant_id`
 * causes an immediate, non-retrying exit. This is the same pattern the
 * billing-tracker cron uses.
 *
 * Error handling: missing PO, mismatched tenant, missing recipient email →
 * log + return. We do NOT throw, because BullMQ would retry forever and an
 * orphaned PO id is a permanent failure. Genuine transient errors (DB down,
 * Resend 5xx) WILL throw and let BullMQ's retry policy do its thing.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
// eslint-disable-next-line no-restricted-imports -- background job loads PO + supplier + tenant for email rendering; runs outside request context so tenantScoped is unavailable
import { adminPrisma } from "@madar/db";
import { EmailService } from "../../../common/email/email.service";
import { formatMoney } from "../../../common/currency";
import {
  renderPurchaseOrderPdf,
  type PurchaseOrderPdfInput,
} from "../../../shared/pdf/po-pdf.renderer";
import {
  SEND_PO_EMAIL_JOB,
  SEND_PO_EMAIL_QUEUE,
  type SendPoEmailJobPayload,
} from "./send-po-email.types";

@Injectable()
@Processor(SEND_PO_EMAIL_QUEUE)
export class SendPoEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendPoEmailProcessor.name);

  constructor(private readonly email: EmailService) {
    super();
  }

  async process(job: Job<SendPoEmailJobPayload>): Promise<{ id: string } | { skipped: true; reason: string }> {
    if (job.name !== SEND_PO_EMAIL_JOB) {
      // Future-proof: same queue may carry other PO-related jobs.
      this.logger.warn(`Unknown job name on PO email queue: ${job.name}`);
      return { skipped: true, reason: "unknown_job_name" };
    }
    return runSendPoEmailJob(this.email, job.data);
  }
}

/**
 * Pure execution path — extracted so the inline-fallback enqueuer can run it
 * without going through BullMQ. Same shape as the BullMQ entry point so the
 * two paths produce identical effects.
 */
export async function runSendPoEmailJob(
  email: EmailService,
  payload: SendPoEmailJobPayload,
): Promise<{ id: string } | { skipped: true; reason: string }> {
  const logger = new Logger("SendPoEmailJob");
  const input = await loadPdfInput(payload.tenantId, payload.purchaseOrderId, logger);
  if (!input) return { skipped: true, reason: "po_not_found_or_tenant_mismatch" };

  const recipient = payload.toEmail ?? input.supplier.contact_email ?? null;
  if (!recipient) {
    logger.warn(
      `PO ${payload.purchaseOrderId} has no recipient email (supplier=${input.supplier.name}); skipping send.`,
    );
    return { skipped: true, reason: "no_recipient" };
  }

  let pdf: Buffer;
  try {
    pdf = await renderPurchaseOrderPdf(input);
  } catch (err) {
    logger.error(
      `PDF render failed for PO ${payload.purchaseOrderId}: ${(err as Error).message}`,
    );
    throw err; // transient → let BullMQ retry; pdf-lib failures are unexpected
  }

  const subject = `Purchase Order ${input.po.code}`;
  const html = renderEmailHtml(input);
  const text = renderEmailText(input);

  const { id } = await email.sendRaw({
    to: recipient,
    subject,
    html,
    text,
    tag: `po-${sanitizeForFilename(input.po.code)}`,
    attachments: [
      {
        filename: `${sanitizeForFilename(input.po.code)}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  logger.log(
    `PO email sent: po=${input.po.code} to=${recipient} bytes=${pdf.length} message_id=${id}`,
  );
  return { id };
}

// ─── Data loader ─────────────────────────────────────────────────────

/**
 * Pull the PO + its dependencies via `adminPrisma`. Returns null if the PO
 * doesn't exist, has been soft-deleted, or belongs to a different tenant
 * than the payload claims.
 *
 * The shape we assemble is intentionally narrow — only the fields the
 * renderer needs. Resist the urge to widen it; the renderer should not have
 * to learn about Prisma column names or relation shapes.
 */
async function loadPdfInput(
  tenantId: string,
  poId: string,
  logger: Logger,
): Promise<PurchaseOrderPdfInput | null> {
  const po = await adminPrisma.purchaseOrder.findFirst({
    where: { id: poId, tenant_id: tenantId, deleted_at: null },
    include: {
      lines: {
        where: { deleted_at: null },
        orderBy: { created_at: "asc" },
      },
      supplier: true,
    },
  });
  if (!po) {
    logger.warn(`PO ${poId} not found for tenant ${tenantId}`);
    return null;
  }

  const branch = await adminPrisma.branch.findFirst({
    where: { id: po.branch_id, tenant_id: tenantId },
  });
  if (!branch) {
    logger.warn(`Branch ${po.branch_id} not found for PO ${poId}`);
    return null;
  }

  const tenant = await adminPrisma.tenant.findUnique({
    where: { id: tenantId },
  });
  if (!tenant) {
    logger.warn(`Tenant ${tenantId} not found for PO ${poId}`);
    return null;
  }

  // Hydrate product names for each line. Done as one batched lookup to keep
  // the loader bounded — a PO with 200 lines should still cost a handful of
  // queries, not 200.
  const productIds = po.lines.map((l) => l.product_id);
  const products = productIds.length
    ? await adminPrisma.product.findMany({
        where: { tenant_id: tenantId, id: { in: productIds } },
        select: { id: true, sku: true, name_i18n: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  return {
    tenant: {
      name: pickI18nEn(tenant.name_i18n, tenant.name),
      // Tenant has no address columns yet — populate when the model is
      // extended. Email/phone live on the owner user, not the tenant, so
      // also deferred.
      address_lines: [],
    },
    po: {
      code: po.code,
      created_at: po.created_at,
      expected_at: po.expected_at,
      currency_code: po.currency_code,
      subtotal_cents: Number(po.subtotal_cents),
      tax_cents: Number(po.tax_cents),
      shipping_cents: Number(po.shipping_cents),
      total_cents: Number(po.total_cents),
      notes: po.notes,
    },
    supplier: {
      name: pickI18nEn(po.supplier.name_i18n, ""),
      contact_name: null,
      contact_email: po.supplier.contact_email,
      address_lines: pickI18nLines(po.supplier.address_i18n),
    },
    branch: {
      name: pickI18nEn(branch.name_i18n, ""),
      address_lines: pickI18nLines(branch.address_i18n),
    },
    lines: po.lines.map((l) => {
      const product = productById.get(l.product_id);
      return {
        sku: product?.sku ?? null,
        product_name: product ? pickI18nEn(product.name_i18n, product.sku ?? l.product_id) : l.product_id,
        qty_ordered: l.qty_ordered,
        unit_cost_cents: Number(l.unit_cost_cents),
        line_total_cents: Number(l.line_total_cents),
      };
    }),
  };
}

// ─── Email body helpers ──────────────────────────────────────────────

function renderEmailHtml(input: PurchaseOrderPdfInput): string {
  // Tiny editorial-style HTML, matching the design tokens used in other
  // templates. Helvetica fallback so the email reads cleanly even where the
  // recipient's mail client strips our preferred fonts.
  return `<!doctype html>
<html lang="en" dir="ltr">
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1A1714; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-family: Fraunces, Georgia, serif; font-size: 22px; margin: 0 0 8px;">Purchase Order ${escapeHtml(input.po.code)}</h1>
  <p style="margin: 0 0 16px; color: #5C564D;">From <strong>${escapeHtml(input.tenant.name)}</strong></p>
  <p style="margin: 0 0 16px;">Hello${input.supplier.contact_name ? ` ${escapeHtml(input.supplier.contact_name)}` : ""},</p>
  <p style="margin: 0 0 16px;">Please find attached purchase order <strong>${escapeHtml(input.po.code)}</strong> for delivery${input.po.expected_at ? ` on or before <strong>${escapeHtml(input.po.expected_at.toISOString().slice(0, 10))}</strong>` : ""}.</p>
  <p style="margin: 0 0 16px;">Total: <strong>${escapeHtml(formatMoney(input.po.total_cents, input.po.currency_code, "en-US"))}</strong></p>
  ${input.po.notes ? `<p style="margin: 0 0 16px; color: #5C564D; font-style: italic;">${escapeHtml(input.po.notes)}</p>` : ""}
  <p style="margin: 24px 0 0;">Thanks,<br />${escapeHtml(input.tenant.name)}</p>
  <hr style="border: none; border-top: 1px solid #E8E4DD; margin: 32px 0;" />
  <p style="font-size: 11px; color: #8A8478;">Sent automatically by Madar POS.</p>
</body>
</html>`;
}

function renderEmailText(input: PurchaseOrderPdfInput): string {
  const lines = [
    `Purchase Order ${input.po.code}`,
    `From ${input.tenant.name}`,
    "",
    `Hello${input.supplier.contact_name ? ` ${input.supplier.contact_name}` : ""},`,
    "",
    `Please find attached purchase order ${input.po.code}${input.po.expected_at ? ` for delivery on or before ${input.po.expected_at.toISOString().slice(0, 10)}` : ""}.`,
    "",
    `Total: ${formatMoney(input.po.total_cents, input.po.currency_code, "en-US")}`,
  ];
  if (input.po.notes) {
    lines.push("", input.po.notes);
  }
  lines.push("", `Thanks,`, input.tenant.name);
  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────

function pickI18nEn(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.en === "string" && obj.en.trim()) return obj.en;
    if (typeof obj.ar === "string" && obj.ar.trim()) return obj.ar;
  }
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

/**
 * Pull a list of address lines from a `{ en, ar }` jsonb column. Accepts
 * either `{ en: "..." }` (a single multi-line string), `{ en: ["...", ...] }`
 * (an array), or null. English wins; falls back to Arabic so a tenant that
 * only filled in Arabic still gets something on the page.
 */
function pickI18nLines(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const candidate = obj.en ?? obj.ar;
  if (Array.isArray(candidate)) return candidate.filter((v): v is string => typeof v === "string");
  if (typeof candidate === "string") {
    return candidate.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
