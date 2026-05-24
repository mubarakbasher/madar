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
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer, tinyPngBuffer } from "../helpers/uploads";

describe("POST /v1/payment-proofs/:id/resubmit", () => {
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

  it("happy path: resubmit a rejected proof -> new proof with previous_proof_id, original cancelled", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "resub-happy" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const ownerToken = pair.access_token;

    // Create a sale and bank account.
    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: t.tenantId,
        branch_id: t.branchId,
        code: `TX-${randomUUID().slice(0, 6)}`,
        cashier_id: t.userId,
        subtotal_cents: 2000n,
        total_cents: 2000n,
        currency_code: "USD",
        payment_method: "bank_transfer",
        payment_status: "payment_pending",
        client_uuid: randomUUID(),
      },
    });
    const bank = await makeTenantBankAccount(t.tenantId);

    // Submit original proof.
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "2000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-RESUB")
      .attach("receipt", jpg, { filename: "receipt.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);
    const originalId = submit.body.id;

    // Reject the original proof.
    const reject = await request(booted.http)
      .post(`/v1/payment-proofs/${originalId}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejection_reason: "Blurry receipt" });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe("rejected");

    // Resubmit with a new receipt.
    const png = await tinyPngBuffer();
    const resub = await request(booted.http)
      .post(`/v1/payment-proofs/${originalId}/resubmit`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("receipt", png, { filename: "receipt2.png", contentType: "image/png" });
    expect(resub.status).toBe(200);

    // Assert new proof links back to original.
    expect(resub.body.previous_proof_id).toBe(originalId);
    expect(resub.body.status).toBe("pending");
    expect(resub.body.id).not.toBe(originalId);
    expect(resub.body.context).toBe("sale");
    expect(resub.body.reference_id).toBe(sale.id);

    // Original proof should now be cancelled.
    const originalRow = await readPaymentProofRow(originalId);
    expect(originalRow!.status).toBe("cancelled");

    // New proof persisted.
    const newRow = await readPaymentProofRow(resub.body.id);
    expect(newRow!.status).toBe("pending");

    // Audit log has the resubmission action.
    const audit = await readAuditLog(t.tenantId, "payment_proof_resubmitted");
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]!.after).toMatchObject({
      original_id: originalId,
      new_id: resub.body.id,
    });
  });

  it("resubmit a pending proof -> 422 proof_not_resubmittable", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "resub-pending" });
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
      .field("transfer_reference", "TR-NORESUB")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Try to resubmit a pending proof (not rejected).
    const png = await tinyPngBuffer();
    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/resubmit`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("receipt", png, { filename: "r2.png", contentType: "image/png" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "proof_not_resubmittable" });
  });

  it("resubmit without file attachment -> 400 receipt_required", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "resub-nofile" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const ownerToken = pair.access_token;

    // We need a real proof id for the endpoint to reach the file check.
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
      .field("transfer_reference", "TR-NOFILE")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Reject it first so we can attempt resubmit.
    await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejection_reason: "test" });

    // POST resubmit without attaching a file.
    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/resubmit`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "receipt_required" });
  });
});
