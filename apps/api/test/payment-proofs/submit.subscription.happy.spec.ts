import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makePlatformBankAccount,
  makeSubscriptionInvoice,
  makeTenant,
  readPaymentProofRow,
  seedStarterPlan,
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyPngBuffer } from "../helpers/uploads";

describe("POST /v1/payment-proofs — happy path (subscription context)", () => {
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

  it("uploads a PNG receipt against a subscription invoice + platform bank account", async () => {
    const tenant = await makeTenant({ slugPrefix: "proof-sub" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: tenant.userId, tenantId: tenant.tenantId, role: "owner" });
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      amountCents: 4900n,
      currencyCode: "USD",
      status: "awaiting_payment",
    });
    const bank = await makePlatformBankAccount({ currencyCode: "USD" });
    const png = await tinyPngBuffer();

    const res = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "subscription")
      .field("reference_id", invoice.id)
      .field("amount_cents", "4900")
      .field("currency_code", "USD")
      .field("bank_account_kind", "platform")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Bayt Coffee Co.")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-58832")
      .attach("receipt", png, { filename: "wire.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.context).toBe("subscription");
    expect(res.body.bank_account_kind).toBe("platform");
    expect(res.body.status).toBe("pending");

    const row = await readPaymentProofRow(res.body.id);
    expect(row!.receipt_image_url).toMatch(/\.png$/);
  });
});
