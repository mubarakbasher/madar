import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
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

describe("POST /v1/payment-proofs — happy path (sale context)", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let storageRoot: string;
  let saleId: string;
  let bankAccountId: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "proof-happy" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;

    // Seed a sale in payment_pending so we have something to attach a proof to.
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

    const bank = await makeTenantBankAccount(t.tenantId, { currencyCode: "USD" });
    bankAccountId = bank.id;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("uploads a JPG receipt, creates pending proof, writes audit, persists file on disk", async () => {
    const jpg = await tinyJpegBuffer();
    const res = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", saleId)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bankAccountId)
      .field("payer_name", "Nadia Hosny")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-99999")
      .attach("receipt", jpg, { filename: "receipt.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.tenant_id).toBe(t.tenantId);
    expect(res.body.context).toBe("sale");
    expect(res.body.reference_id).toBe(saleId);
    expect(res.body.status).toBe("pending");
    expect(res.body.payer_name).toBe("Nadia Hosny");
    expect(res.body.amount_cents).toBe("1000");
    expect(res.body.receipt_url).toBe(`/v1/payment-proofs/${res.body.id}/receipt`);

    // Disk: file exists at the expected path.
    const row = await readPaymentProofRow(res.body.id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.receipt_image_url).toMatch(
      new RegExp(`^tenants/${t.tenantId}/payment-proofs/${res.body.id}\\.jpg$`),
    );
    const absPath = path.join(storageRoot, ...row!.receipt_image_url.split("/"));
    const written = await fs.readFile(absPath);
    expect(written.length).toBeGreaterThan(0);

    // Audit row.
    const audit = await readAuditLog(t.tenantId, "payment_proof_submitted");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after).toMatchObject({
      context: "sale",
      reference_id: saleId,
    });
  });
});
