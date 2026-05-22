import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import {
  makePlatformBankAccount,
  makeSubscriptionInvoice,
  makeTenant,
  makeTenantBankAccount,
  makeTenantWithCatalog,
  seedStarterPlan,
} from "../helpers/fixtures";
import { makePlatformUser } from "../helpers/admin-fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("GET /v1/admin/payment-proofs — admin list", () => {
  let booted: BootedTestApp;
  let storageRoot: string;
  let adminToken: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    booted = await bootTestApp();
    const a = await makePlatformUser({ emailPrefix: "admin-list" });
    const pair = await booted.app.get(AdminTokenService).mintAccessPair({
      platformUserId: a.platformUserId,
      email: a.email,
      role: a.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    adminToken = pair.access_token;
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
  });

  it("returns cross-tenant proofs filtered by context and tenant_id", async () => {
    // Tenant A: a sale proof.
    const tA = await makeTenantWithCatalog({ slugPrefix: "adm-list-A" });
    const tokenA = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })
    ).access_token;
    const saleA = await adminPrisma.sale.create({
      data: {
        tenant_id: tA.tenantId,
        branch_id: tA.branchId,
        code: `TX-${randomUUID().slice(0, 6)}`,
        cashier_id: tA.userId,
        subtotal_cents: 1000n,
        total_cents: 1000n,
        currency_code: "USD",
        payment_method: "bank_transfer",
        payment_status: "payment_pending",
        client_uuid: randomUUID(),
      },
    });
    const bankA = await makeTenantBankAccount(tA.tenantId);
    const jpg = await tinyJpegBuffer();
    const submitA = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", saleA.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bankA.id)
      .field("payer_name", "A")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-A")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submitA.status).toBe(201);

    // Tenant B: a subscription proof.
    const tB = await makeTenant({ slugPrefix: "adm-list-B" });
    const tokenB = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })
    ).access_token;
    const plan = await seedStarterPlan();
    const invB = await makeSubscriptionInvoice(tB.tenantId, plan.id);
    const bankPlatform = await makePlatformBankAccount();
    const submitB = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${tokenB}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "subscription")
      .field("reference_id", invB.id)
      .field("amount_cents", "4900")
      .field("currency_code", "USD")
      .field("bank_account_kind", "platform")
      .field("bank_account_id", bankPlatform.id)
      .field("payer_name", "B")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-B")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submitB.status).toBe(201);

    // List ?context=subscription returns just tenant B's proof (cross-tenant).
    const subOnly = await request(booted.http)
      .get("/v1/admin/payment-proofs?context=subscription")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(subOnly.status).toBe(200);
    const subIds = subOnly.body.items.map((i: { id: string }) => i.id);
    expect(subIds).toContain(submitB.body.id);
    expect(subIds).not.toContain(submitA.body.id);

    // List ?tenant_id=tA returns only tenant A's proofs.
    const tenantOnly = await request(booted.http)
      .get(`/v1/admin/payment-proofs?tenant_id=${tA.tenantId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(tenantOnly.status).toBe(200);
    expect(tenantOnly.body.items.every((i: { tenant_id: string }) => i.tenant_id === tA.tenantId)).toBe(true);
  });
});
