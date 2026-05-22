import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantBankAccount,
  makeTenantWithCatalog,
  readAuditLog,
  readPaymentProofRow,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("POST /v1/payment-proofs/:id/verify — sale context", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let storageRoot: string;
  let saleId: string;
  let proofId: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "proof-verify" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    ownerToken = pair.access_token;

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
    saleId = sale.id;

    const bank = await makeTenantBankAccount(t.tenantId);
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", saleId)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-VER")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);
    proofId = submit.body.id;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("verifies as owner: status→verified, Sale.payment_status→paid, audit row written", async () => {
    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${proofId}/verify`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("verified");
    expect(res.body.verified_by).toBe(t.userId);
    expect(res.body.verified_at).toEqual(expect.any(String));

    const row = await readPaymentProofRow(proofId);
    expect(row!.status).toBe("verified");

    // Sale moved forward.
    const sale = await adminPrisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.payment_status).toBe("paid");

    // Audit row.
    const audit = await readAuditLog(t.tenantId, "payment_proof_verified");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({ sale_id: saleId, status: "verified" });
  });

  it("a second verify call returns 422 proof_not_pending", async () => {
    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${proofId}/verify`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "proof_not_pending" });
  });
});
