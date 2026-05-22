import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  readAuditLog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";
import {
  makeStorageRoot,
  oversizeJpegBuffer,
  removeStorageRoot,
  tinyJpegBuffer,
} from "../helpers/uploads";

async function createSupplier(
  http: BootedTestApp["http"],
  token: string,
): Promise<string> {
  const res = await request(http)
    .post("/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", randomUUID())
    .send({
      code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
      name_i18n: { en: "Doc Supplier", ar: "مورد وثائق" },
      currency_code: "USD",
    });
  if (res.status !== 201) {
    throw new Error(`failed to create supplier: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.id as string;
}

describe("Supplier documents (/v1/suppliers/:id/documents)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "supp-doc" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("Upload happy: JPG + ClamAV stub passes + DB row exists + audit", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const jpg = await tinyJpegBuffer();
    const res = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("kind", "contract")
      .field("notes", "signed 2026-05-12")
      .attach("file", jpg, { filename: "contract.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.kind).toBe("contract");
    expect(res.body.mime_type).toBe("image/jpeg");
    expect(res.body.size_bytes).toBeGreaterThan(0);
    expect(res.body.download_url).toBe(
      `/v1/suppliers/${supplierId}/documents/${res.body.id}/download`,
    );

    const list = await request(booted.http)
      .get(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const audit = await readAuditLog(t.tenantId, "supplier_document_uploaded");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("413/400 oversize (>5MB)", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const big = await oversizeJpegBuffer();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    const res = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("kind", "contract")
      .attach("file", big, { filename: "big.jpg", contentType: "image/jpeg" });
    // Multer enforces the size limit first (returns 413 on platform-express;
    // 400 if propagated through Nest's filter).
    expect([400, 413]).toContain(res.status);
  });

  it("400 bad MIME (text/plain)", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const res = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("kind", "other")
      .attach("file", Buffer.from("hello", "utf8"), {
        filename: "note.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("file_mime_unsupported");
  });

  it("DELETE soft-deletes and excludes from list", async () => {
    const supplierId = await createSupplier(booted.http, ownerToken);
    const jpg = await tinyJpegBuffer();
    const create = await request(booted.http)
      .post(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("kind", "tax_certificate")
      .attach("file", jpg, { filename: "tax.jpg", contentType: "image/jpeg" });
    expect(create.status).toBe(201);
    const docId = create.body.id as string;

    const del = await request(booted.http)
      .delete(`/v1/suppliers/${supplierId}/documents/${docId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted_at).toBeTruthy();

    const list = await request(booted.http)
      .get(`/v1/suppliers/${supplierId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.find((r: { id: string }) => r.id === docId)).toBeUndefined();
  });
});
