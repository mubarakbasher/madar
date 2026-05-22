import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantBankAccount,
  makeTenantWithCatalog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("GET /v1/payment-proofs/:id/receipt", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let storageRoot: string;
  let proofId: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "proof-stream" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;

    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: t.tenantId,
        branch_id: t.branchId,
        code: `TX-${randomUUID().slice(0, 6)}`,
        cashier_id: t.userId,
        subtotal_cents: 1000n,
        total_cents: 1000n,
        currency_code: "USD",
        payment_method: "bank_transfer",
        payment_status: "payment_pending",
        client_uuid: randomUUID(),
      },
    });
    const bank = await makeTenantBankAccount(t.tenantId);
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-STREAM")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);
    proofId = submit.body.id;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("streams the JPG bytes with Content-Type image/jpeg", async () => {
    const res = await request(booted.http)
      .get(`/v1/payment-proofs/${proofId}/receipt`)
      .set("Authorization", `Bearer ${accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/jpeg/);
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    // JPG magic bytes: FF D8 FF.
    expect(body[0]).toBe(0xff);
    expect(body[1]).toBe(0xd8);
    expect(body[2]).toBe(0xff);
  });

  it("401 without Bearer token", async () => {
    const res = await request(booted.http).get(`/v1/payment-proofs/${proofId}/receipt`);
    expect(res.status).toBe(401);
  });
});
