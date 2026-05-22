import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

async function jpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("Product image upload (POST/DELETE/GET /v1/products/:id/image)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;
  let productId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "img-test" });
    productId = t.products[0]!.id;
    const ownerPair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    ownerToken = ownerPair.access_token;
    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    const cashierPair = await tokens.mintPair({
      userId: cashier.id,
      tenantId: t.tenantId,
      role: "cashier",
    });
    cashierToken = cashierPair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("happy upload: 200 with image_url + audit row", async () => {
    const img = await jpegBuffer(300, 300);
    const res = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .attach("image", img, { filename: "test.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(res.body.image_url).toMatch(new RegExp(`tenants/${t.tenantId}/products/${productId}\\.`));

    const audit = await readAuditLog(t.tenantId, "product_image_set");
    expect(audit.some((r) => (r.after as { image_url?: string })?.image_url?.includes(productId))).toBe(true);
  });

  it("missing file returns 400 image_required", async () => {
    const res = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("image_required");
  });

  it("non-image MIME (text/plain) returns 400 file_mime_unsupported", async () => {
    const res = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .attach("image", Buffer.from("not an image"), { filename: "fake.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("file_mime_unsupported");
  });

  it("cashier role returns 403 forbidden_role", async () => {
    const img = await jpegBuffer(200, 200);
    const res = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .attach("image", img, { filename: "test.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("public GET returns image bytes with image/* Content-Type", async () => {
    // Upload first so the public route has bytes to serve.
    const img = await jpegBuffer(400, 400);
    const upload = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .attach("image", img, { filename: "test.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(200);

    const res = await request(booted.http).get(
      `/v1/public/tenants/${t.tenantId}/products/${productId}/image`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\//);
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("DELETE clears image_url + audits product_image_cleared", async () => {
    const res = await request(booted.http)
      .delete(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.image_url).toBeNull();
    const audit = await readAuditLog(t.tenantId, "product_image_cleared");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("RLS: tenant B cannot upload to tenant A's product (404)", async () => {
    const tB = await makeTenantWithCatalog({ slugPrefix: "img-rls-b" });
    const tBPair = await tokens.mintPair({
      userId: tB.userId,
      tenantId: tB.tenantId,
      role: "owner",
    });
    const img = await jpegBuffer(200, 200);
    const res = await request(booted.http)
      .post(`/v1/products/${productId}/image`)
      .set("Authorization", `Bearer ${tBPair.access_token}`)
      .set("Idempotency-Key", randomUUID())
      .attach("image", img, { filename: "test.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("product_not_found");
  });
});
