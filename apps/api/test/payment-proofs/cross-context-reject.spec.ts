import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makePlatformBankAccount,
  makeSubscriptionInvoice,
  makeTenantBankAccount,
  makeTenant,
  makeTenantWithCatalog,
  seedStarterPlan,
} from "../helpers/fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("Cross-context + role rejection on verify/reject", () => {
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

  it("tenant verifier on a subscription proof → 403 wrong_realm", async () => {
    const t = await makeTenant({ slugPrefix: "x-sub" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(t.tenantId, plan.id);
    const bank = await makePlatformBankAccount();
    const jpg = await tinyJpegBuffer();

    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${pair.access_token}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "subscription")
      .field("reference_id", invoice.id)
      .field("amount_cents", "4900")
      .field("currency_code", "USD")
      .field("bank_account_kind", "platform")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Tenant Owner")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-X")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Tenant tries to verify it — wrong realm for subscription.
    const verify = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/verify`)
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(verify.status).toBe(403);
    expect(verify.body).toMatchObject({ code: "wrong_realm" });
  });

  it("cashier (non-supervisor role) on a sale proof → 403 forbidden_role", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "x-cashier" });

    // Create a cashier user in this tenant.
    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
      },
    });
    const cashierToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const ownerToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;
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
      .field("transfer_reference", "TR-X")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const verify = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/verify`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(verify.status).toBe(403);
    expect(verify.body).toMatchObject({ code: "forbidden_role" });
  });
});
