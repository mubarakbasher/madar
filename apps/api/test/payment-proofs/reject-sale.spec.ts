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
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("POST /v1/payment-proofs/:id/reject — sale context", () => {
  let booted: BootedTestApp;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("rejects with reason: status→rejected, Sale.payment_status→disputed, reason persisted", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "proof-reject" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const ownerToken = pair.access_token;

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
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-REJ")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejection_reason: "Amount does not match the receipt", notes: "Re-check bank ref" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejection_reason).toBe("Amount does not match the receipt");

    const row = await readPaymentProofRow(submit.body.id);
    expect(row!.status).toBe("rejected");
    expect(row!.rejection_reason).toBe("Amount does not match the receipt");

    // Sale moved to disputed.
    const after = await adminPrisma.sale.findUnique({ where: { id: sale.id } });
    expect(after!.payment_status).toBe("disputed");

    // Audit row.
    const audit = await readAuditLog(t.tenantId, "payment_proof_rejected");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({
      status: "rejected",
      rejection_reason: "Amount does not match the receipt",
      sale_id: sale.id,
    });
  });

  it("400 from zod when rejection_reason is missing", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "proof-reject-norsn" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const ownerToken = pair.access_token;

    // We need a real proof id to even reach the validation step.
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
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-NORSN")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
