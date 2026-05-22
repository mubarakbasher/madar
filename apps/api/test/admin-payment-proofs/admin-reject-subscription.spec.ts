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
  seedStarterPlan,
} from "../helpers/fixtures";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

describe("POST /v1/admin/payment-proofs/:id/reject + realm canary", () => {
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

  it("admin rejects subscription proof → invoice rolls back to awaiting_payment, audit written", async () => {
    const tenant = await makeTenant({ slugPrefix: "adm-rej" });
    const tenantToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: tenant.userId, tenantId: tenant.tenantId, role: "owner" })
    ).access_token;
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "in_review",
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
      .field("payer_name", "Tenant")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "WIRE-R")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const admin = await makePlatformUser({ emailPrefix: "adm-rejector", role: "finance" });
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
      .send({ rejection_reason: "Receipt unreadable", notes: "Please resubmit a clearer photo" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejection_reason).toBe("Receipt unreadable");

    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("awaiting_payment");

    const audit = await readPlatformAudit(admin.platformUserId, "admin_proof_rejected");
    expect(audit).toHaveLength(1);
  });

  it("tenant-realm token on /v1/admin/payment-proofs/* → 401 (realm canary)", async () => {
    const tenant = await makeTenant({ slugPrefix: "adm-canary" });
    const tenantToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: tenant.userId, tenantId: tenant.tenantId, role: "owner" })
    ).access_token;
    const res = await request(booted.http)
      .get("/v1/admin/payment-proofs")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "admin_access_expired" });
  });
});
