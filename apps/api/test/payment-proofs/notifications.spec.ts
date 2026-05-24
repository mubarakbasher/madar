import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

const EMAIL_DIR = path.resolve(__dirname, "..", "var", "test-emails-notifications");

describe("Payment proof email notifications", () => {
  let booted: BootedTestApp;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await makeStorageRoot();
    process.env.EMAIL_LOG_DIR = EMAIL_DIR;
    await fs.rm(EMAIL_DIR, { recursive: true, force: true });
    await fs.mkdir(EMAIL_DIR, { recursive: true });
    booted = await bootTestApp();
  });

  afterEach(async () => {
    // Clean up email dir between tests.
    try {
      const files = await fs.readdir(EMAIL_DIR);
      for (const f of files) await fs.unlink(path.join(EMAIL_DIR, f));
    } catch { /* empty dir is fine */ }
  });

  afterAll(async () => {
    await booted.app.close();
    await removeStorageRoot(storageRoot);
    await fs.rm(EMAIL_DIR, { recursive: true, force: true });
  });

  it("reject sends payment_proof_rejected email", async () => {
    // Subscription proof: rejection triggers email notification.
    const tenant = await makeTenant({ slugPrefix: "notif-rej" });
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
      .field("payer_name", "Owner")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-NR")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Admin rejects.
    const admin = await makePlatformUser({ emailPrefix: "notif-rej-admin", role: "owner" });
    const adminToken = (
      await booted.app.get(AdminTokenService).mintAccessPair({
        platformUserId: admin.platformUserId,
        email: admin.email,
        role: admin.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;

    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${submit.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rejection_reason: "Wrong amount" });
    expect(res.status).toBe(200);

    // Wait for fire-and-forget email.
    await new Promise((r) => setTimeout(r, 500));

    const files = await fs.readdir(EMAIL_DIR);
    const emailFile = files.find((f) => f.includes("payment_proof_rejected"));
    expect(emailFile).toBeTruthy();
    if (emailFile) {
      const contents = await fs.readFile(path.join(EMAIL_DIR, emailFile), "utf8");
      expect(contents).toContain("X-Madar-Template: payment_proof_rejected");
    }
  });

  it("verify sale proof sends payment_received email", async () => {
    const t = await makeTenantWithCatalog({ slugPrefix: "notif-ver" });
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
        subtotal_cents: 3000n,
        total_cents: 3000n,
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
      .field("amount_cents", "3000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Payer")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-NVER")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    // Verify as owner.
    const res = await request(booted.http)
      .post(`/v1/payment-proofs/${submit.body.id}/verify`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("verified");

    // Wait for fire-and-forget email.
    await new Promise((r) => setTimeout(r, 500));

    const files = await fs.readdir(EMAIL_DIR);
    const emailFile = files.find((f) => f.includes("payment_received"));
    expect(emailFile).toBeTruthy();
    if (emailFile) {
      const contents = await fs.readFile(path.join(EMAIL_DIR, emailFile), "utf8");
      expect(contents).toContain("X-Madar-Template: payment_received");
    }
  });
});
