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
  readPaymentProofRow,
  seedStarterPlan,
} from "../helpers/fixtures";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("POST /v1/admin/payment-proofs/:id/verify — subscription context", () => {
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

  it("admin verifies a subscription proof: status→verified, invoice→paid + paid_at, platform audit written", async () => {
    const tenant = await makeTenant({ slugPrefix: "adm-ver" });
    const tenantToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: tenant.userId, tenantId: tenant.tenantId, role: "owner" })
    ).access_token;
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "awaiting_payment",
    });
    const bank = await makePlatformBankAccount();
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "subscription")
      .field("reference_id", invoice.id)
      .field("amount_cents", "4900")
      .field("currency_code", "USD")
      .field("bank_account_kind", "platform")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Tenant Owner")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-V")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Admin verifies.
    const admin = await makePlatformUser({ emailPrefix: "adm-verifier", role: "owner" });
    const adminToken = (
      await booted.app.get(AdminTokenService).mintAccessPair({
        platformUserId: admin.platformUserId,
        email: admin.email,
        role: admin.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;

    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${submit.body.id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("verified");
    expect(res.body.verified_by).toBe(admin.platformUserId);

    const row = await readPaymentProofRow(submit.body.id);
    expect(row!.status).toBe("verified");

    // Subscription invoice moved forward.
    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("paid");
    expect(inv!.paid_at).not.toBeNull();

    // Platform audit row.
    const audit = await readPlatformAudit(admin.platformUserId, "admin_proof_verified");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.target_tenant_id).toBe(tenant.tenantId);
  });

  it("admin verifies a SALE-context proof → 403 wrong_realm", async () => {
    // Set up: tenant submits a SALE proof; admin tries to verify it (wrong realm).
    const t = await makeTenant({ slugPrefix: "adm-wrong-realm" });
    const tenantToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;
    // We need a branch + sale.
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: "br-x",
        name_i18n: { en: "X", ar: "X" },
        currency_code: "USD",
      },
    });
    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: t.tenantId,
        branch_id: branch.id,
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
    const bank = await adminPrisma.tenantBankAccount.create({
      data: {
        tenant_id: t.tenantId,
        name_i18n: { en: "X", ar: "X" },
        bank_name: "X",
        account_holder: "X",
        account_number_last4: "0000",
        account_number_encrypted: "x",
        currency_code: "USD",
      },
    });
    const jpg = await tinyJpegBuffer();
    const submit = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "X")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-WR")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const admin = await makePlatformUser({ emailPrefix: "adm-wrong" });
    const adminToken = (
      await booted.app.get(AdminTokenService).mintAccessPair({
        platformUserId: admin.platformUserId,
        email: admin.email,
        role: admin.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;
    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${submit.body.id}/verify`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "wrong_realm" });
  });
});
