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

describe("GET /v1/payment-proofs — list", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "proof-list" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;

    const bank = await makeTenantBankAccount(t.tenantId);
    const jpg = await tinyJpegBuffer();

    // Three sale-context proofs.
    for (let i = 0; i < 3; i++) {
      const sale = await adminPrisma.sale.create({
        data: {
          tenant_id: t.tenantId,
          branch_id: t.branchId,
          code: `TX-${randomUUID().slice(0, 6)}-${i}`,
          cashier_id: t.userId,
          subtotal_cents: 1000n,
          total_cents: 1000n,
          currency_code: "USD",
          payment_method: "bank_transfer",
          payment_status: "payment_pending",
          client_uuid: randomUUID(),
        },
      });
      const res = await request(booted.http)
        .post("/v1/payment-proofs")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", randomUUID())
        .field("context", "sale")
        .field("reference_id", sale.id)
        .field("amount_cents", "1000")
        .field("currency_code", "USD")
        .field("bank_account_kind", "tenant")
        .field("bank_account_id", bank.id)
        .field("payer_name", `Payer ${i}`)
        .field("transfer_date", "2026-05-15")
        .field("transfer_reference", `TR-${i}`)
        .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(201);
    }
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("returns all 3 proofs for this tenant", async () => {
    const res = await request(booted.http)
      .get("/v1/payment-proofs")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    expect(res.body.items.every((p: { tenant_id: string }) => p.tenant_id === t.tenantId)).toBe(true);
  });

  it("?context=sale narrows the result", async () => {
    const res = await request(booted.http)
      .get("/v1/payment-proofs?context=sale")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { context: string }) => p.context === "sale")).toBe(true);
  });

  it("?status=pending narrows the result", async () => {
    const res = await request(booted.http)
      .get("/v1/payment-proofs?status=pending")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { status: string }) => p.status === "pending")).toBe(true);
  });

  it("?limit=1 paginates", async () => {
    const res = await request(booted.http)
      .get("/v1/payment-proofs?limit=1")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.limit).toBe(1);
  });
});
