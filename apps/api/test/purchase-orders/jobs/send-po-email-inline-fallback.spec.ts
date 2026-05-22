/**
 * Validates that `SendPoEmailQueue.enqueue()` (and the functional
 * `enqueueSendPoEmailJob`) fall back to inline execution when the BullMQ
 * queue is unavailable. Vitest runs without REDIS_URL, so the natural
 * test-time path IS the inline path — we additionally simulate "queue
 * present but throwing" to cover the catch branch.
 *
 * End-to-end shape:
 *   1. Seed a tenant + branch + supplier + product + PO + PO line via
 *      adminPrisma (the PO controller doesn't exist yet — Task 5).
 *   2. Call `enqueueSendPoEmailJob` with a throwing fake queue.
 *   3. Assert the disk email provider wrote an .eml + a sibling PDF file.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminPrisma } from "@madar/db";
import { DiskEmailProvider } from "../../../src/common/email/disk.provider";
import { EmailService } from "../../../src/common/email/email.service";
import { enqueueSendPoEmailJob } from "../../../src/tenant/purchase-orders/jobs/send-po-email.queue";
import {
  SEND_PO_EMAIL_JOB,
  type SendPoEmailJobPayload,
} from "../../../src/tenant/purchase-orders/jobs/send-po-email.types";
import { makeTenantWithCatalog } from "../../helpers/fixtures";

const SPEC_EMAIL_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "var",
  "test-emails-po-inline",
);

describe("send-po-email inline fallback", () => {
  beforeAll(async () => {
    process.env.EMAIL_LOG_DIR = SPEC_EMAIL_DIR;
    await fs.rm(SPEC_EMAIL_DIR, { recursive: true, force: true });
    await fs.mkdir(SPEC_EMAIL_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(SPEC_EMAIL_DIR, { recursive: true, force: true });
  });

  it("runs the processor inline when queue.add throws", async () => {
    // ─── Arrange ───────────────────────────────────────────────────
    const fixture = await makeTenantWithCatalog({
      slugPrefix: "po-inline",
      emailPrefix: "po-inline",
    });

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: fixture.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Acme Wholesalers", ar: "أكمي" },
        currency_code: "USD",
        contact_email: "buyer@acme.test",
        address_i18n: { en: ["1 Industrial Way", "Cairo"], ar: ["Ar line"] },
      },
    });

    const po = await adminPrisma.purchaseOrder.create({
      data: {
        tenant_id: fixture.tenantId,
        code: `PO-${randomUUID().slice(0, 6).toUpperCase()}`,
        supplier_id: supplier.id,
        branch_id: fixture.branchId,
        currency_code: "USD",
        status: "ordered",
        subtotal_cents: 10000n,
        tax_cents: 1400n,
        shipping_cents: 500n,
        total_cents: 11900n,
        notes: "Please deliver before noon.",
      },
    });

    const firstProduct = fixture.products[0]!;
    await adminPrisma.purchaseOrderLine.create({
      data: {
        tenant_id: fixture.tenantId,
        po_id: po.id,
        product_id: firstProduct.id,
        qty_ordered: 5,
        unit_cost_cents: 2000n,
        line_total_cents: 10000n,
      },
    });

    // Use a real disk provider + a real EmailService so the test exercises
    // the same code path the production processor will hit.
    const provider = new DiskEmailProvider();
    const email = new EmailService(provider);

    // Spy on the provider's `send` so we can assert the attachment shape
    // even if the disk write somehow loses it.
    const sendSpy = vi.spyOn(provider, "send");

    // ─── Act ──────────────────────────────────────────────────────
    const throwingQueue = {
      add: vi.fn(async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:6379");
      }),
    };

    const payload: SendPoEmailJobPayload = {
      tenantId: fixture.tenantId,
      purchaseOrderId: po.id,
    };

    await enqueueSendPoEmailJob(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { email, queue: throwingQueue as any },
      payload,
    );

    // ─── Assert ───────────────────────────────────────────────────
    // 1. The fake queue WAS attempted (proves we tried BullMQ first).
    expect(throwingQueue.add).toHaveBeenCalledOnce();
    expect(throwingQueue.add).toHaveBeenCalledWith(
      SEND_PO_EMAIL_JOB,
      expect.objectContaining({ purchaseOrderId: po.id }),
      expect.any(Object),
    );

    // 2. The mail service received a send call with a PDF attachment.
    expect(sendSpy).toHaveBeenCalledOnce();
    const sentMessage = sendSpy.mock.calls[0]![0];
    expect(sentMessage.to).toBe("buyer@acme.test");
    expect(sentMessage.subject).toBe(`Purchase Order ${po.code}`);
    expect(sentMessage.template).toBe("raw");
    expect(sentMessage.attachments).toBeDefined();
    expect(sentMessage.attachments).toHaveLength(1);
    const attachment = sentMessage.attachments![0]!;
    expect(attachment.filename).toMatch(/\.pdf$/);
    expect(attachment.contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(attachment.content)).toBe(true);
    expect(attachment.content.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    // 3. The disk provider actually wrote the .eml + sibling PDF file.
    const files = await fs.readdir(SPEC_EMAIL_DIR);
    expect(files.some((f) => f.endsWith(".eml"))).toBe(true);
    expect(files.some((f) => f.includes(".attachment.") && f.endsWith(".pdf"))).toBe(true);

    // 4. The sibling PDF is a real PDF.
    const pdfFile = files.find((f) => f.includes(".attachment.") && f.endsWith(".pdf"))!;
    const pdfBytes = await fs.readFile(path.join(SPEC_EMAIL_DIR, pdfFile));
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBytes.length).toBeGreaterThan(1000);
  });

  it("skips cleanly when supplier has no email and no override is given", async () => {
    const fixture = await makeTenantWithCatalog({
      slugPrefix: "po-noemail",
      emailPrefix: "po-noemail",
    });

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: fixture.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Silent Supplier", ar: "صامت" },
        currency_code: "USD",
        // No contact_email on purpose.
      },
    });

    const po = await adminPrisma.purchaseOrder.create({
      data: {
        tenant_id: fixture.tenantId,
        code: `PO-${randomUUID().slice(0, 6).toUpperCase()}`,
        supplier_id: supplier.id,
        branch_id: fixture.branchId,
        currency_code: "USD",
        status: "draft",
        subtotal_cents: 0n,
        tax_cents: 0n,
        shipping_cents: 0n,
        total_cents: 0n,
      },
    });

    const provider = new DiskEmailProvider();
    const email = new EmailService(provider);
    const sendSpy = vi.spyOn(provider, "send");

    await enqueueSendPoEmailJob(
      { email, queue: null },
      { tenantId: fixture.tenantId, purchaseOrderId: po.id },
    );

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips when the PO id doesn't exist", async () => {
    const fixture = await makeTenantWithCatalog({
      slugPrefix: "po-missing",
      emailPrefix: "po-missing",
    });

    const provider = new DiskEmailProvider();
    const email = new EmailService(provider);
    const sendSpy = vi.spyOn(provider, "send");

    await enqueueSendPoEmailJob(
      { email, queue: null },
      { tenantId: fixture.tenantId, purchaseOrderId: randomUUID() },
    );

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
