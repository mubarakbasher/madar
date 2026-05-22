import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * End-to-end:
 *   1. /order with send_email=true exercises the inline fallback (no Redis in
 *      vitest) and the disk-email provider writes both an .eml and a sibling
 *      PDF attachment under EMAIL_LOG_DIR. We use the suite-default dir (the
 *      env is cached at boot, so per-spec EMAIL_LOG_DIR overrides applied AFTER
 *      Nest boot don't propagate) and filter on the unique recipient address.
 *   2. GET /:id/pdf returns valid `application/pdf` magic bytes + > 1 KB body.
 *
 * The default dir is set in test/setup.ts to apps/api/var/test-emails. We do
 * NOT clean it because other concurrent specs in the same vitest fork may be
 * writing to it; instead the assertion filters by the unique recipient string.
 */
const DEFAULT_EMAIL_DIR = path.resolve(__dirname, "..", "..", "var", "test-emails");

describe("Purchase-order email + PDF endpoint", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let supplierId: string;
  // Unique recipient per test run so we never collide with files left by other
  // specs in the same EMAIL_LOG_DIR.
  const RECIPIENT = `po-email-${randomUUID().slice(0, 8)}@example.test`;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "po-email" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const supplier = await adminPrisma.supplier.create({
      data: {
        tenant_id: t.tenantId,
        code: `SUP-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Email Supplier", ar: "Email" },
        currency_code: "USD",
        contact_email: RECIPIENT,
      },
    });
    supplierId = supplier.id;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  async function makeDraft(): Promise<string> {
    const res = await request(booted.http)
      .post("/v1/purchase-orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        supplier_id: supplierId,
        branch_id: t.branchId,
        notes: "Spec PO for email",
        lines: [{ product_id: t.products[0]!.id, qty_ordered: 4, unit_cost_cents: 1500 }],
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("POST /:id/order with send_email=true writes a disk .eml + sibling PDF attachment", async () => {
    const id = await makeDraft();
    const res = await request(booted.http)
      .post(`/v1/purchase-orders/${id}/order`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ send_email: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");

    // The inline-fallback path (no REDIS_URL in vitest) runs the processor
    // synchronously, so by the time /order returns, the disk provider has
    // already flushed the .eml + sibling PDF. We filter by the unique
    // recipient string (the disk provider encodes it in the filename) so
    // other parallel specs' artifacts don't confuse us.
    const safeRecipient = RECIPIENT.replace(/[^a-z0-9._@-]/gi, "_");
    const files = await fs.readdir(DEFAULT_EMAIL_DIR);
    const matching = files.filter((f) => f.includes(safeRecipient));
    const eml = matching.find((f) => f.endsWith(".eml"));
    const pdf = matching.find((f) => f.includes(".attachment.") && f.endsWith(".pdf"));
    expect(eml).toBeDefined();
    expect(pdf).toBeDefined();

    const pdfBytes = await fs.readFile(path.join(DEFAULT_EMAIL_DIR, pdf!));
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBytes.length).toBeGreaterThan(1000);
  });

  it("GET /:id/pdf returns application/pdf with valid magic bytes + non-trivial size", async () => {
    const id = await makeDraft();
    const res = await request(booted.http)
      .get(`/v1/purchase-orders/${id}/pdf`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .buffer(true)
      .parse((response, callback) => {
        // supertest needs an explicit binary parser for non-text bodies.
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="PO-/);
    const buf = res.body as Buffer;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
