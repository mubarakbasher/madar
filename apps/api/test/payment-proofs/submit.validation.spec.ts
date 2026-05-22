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
import {
  makeStorageRoot,
  oversizeJpegBuffer,
  removeStorageRoot,
  tinyJpegBuffer,
} from "../helpers/uploads";

describe("POST /v1/payment-proofs — validation", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let storageRoot: string;
  let saleId: string;
  let bankAccountId: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "proof-val" });
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
    saleId = sale.id;
    const bank = await makeTenantBankAccount(t.tenantId);
    bankAccountId = bank.id;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  function baseFields() {
    return {
      context: "sale",
      reference_id: saleId,
      amount_cents: "1000",
      currency_code: "USD",
      bank_account_kind: "tenant",
      bank_account_id: bankAccountId,
      payer_name: "Test Payer",
      transfer_date: "2026-05-15",
      transfer_reference: "TR-001",
    };
  }

  function postProof(fields: Record<string, string>, file?: Buffer, contentType = "image/jpeg") {
    let r = request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID());
    for (const [k, v] of Object.entries(fields)) {
      r = r.field(k, v);
    }
    if (file) {
      r = r.attach("receipt", file, { filename: `receipt.${contentType.split("/")[1]}`, contentType });
    }
    return r;
  }

  it("400 receipt_required when no file is attached", async () => {
    const res = await postProof(baseFields());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "receipt_required" });
  });

  it("400 file_mime_unsupported for a text file", async () => {
    const res = await postProof(baseFields(), Buffer.from("hello world", "utf8"), "text/plain");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "file_mime_unsupported" });
  });

  it("400 file_too_large for >5MB", async () => {
    const big = await oversizeJpegBuffer();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    const res = await postProof(baseFields(), big, "image/jpeg");
    // Multer caught the size limit first.
    expect([400, 413]).toContain(res.status);
  });

  it("400 from zod for invalid transfer_date format", async () => {
    const jpg = await tinyJpegBuffer();
    const res = await postProof({ ...baseFields(), transfer_date: "15-05-2026" }, jpg);
    expect(res.status).toBe(400);
  });

  it("422 unknown_sale for a reference_id that doesn't exist", async () => {
    const jpg = await tinyJpegBuffer();
    const res = await postProof({ ...baseFields(), reference_id: randomUUID() }, jpg);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_sale" });
  });

  it("422 unknown_bank_account when the tenant bank id is bogus", async () => {
    const jpg = await tinyJpegBuffer();
    const res = await postProof({ ...baseFields(), bank_account_id: randomUUID() }, jpg);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "unknown_bank_account" });
  });
});
