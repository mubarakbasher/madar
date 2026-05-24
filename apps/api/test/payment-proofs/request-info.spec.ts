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
  readPaymentProofRow,
  seedStarterPlan,
} from "../helpers/fixtures";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { makeStorageRoot, removeStorageRoot, tinyJpegBuffer } from "../helpers/uploads";

const EMAIL_DIR = path.resolve(__dirname, "..", "var", "test-emails-request-info");

describe("POST /v1/admin/payment-proofs/:id/request-info", () => {
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

  /** Helper: submit a subscription proof as a tenant and return admin token + proof id. */
  async function setupSubscriptionProof(): Promise<{
    proofId: string;
    tenantId: string;
    adminToken: string;
    adminId: string;
  }> {
    const tenant = await makeTenant({ slugPrefix: "ri" });
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
      .field("transfer_reference", "WIRE-RI")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(submit.status).toBe(201);

    const admin = await makePlatformUser({ emailPrefix: "ri-admin", role: "owner" });
    const adminToken = (
      await booted.app.get(AdminTokenService).mintAccessPair({
        platformUserId: admin.platformUserId,
        email: admin.email,
        role: admin.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;

    return {
      proofId: submit.body.id,
      tenantId: tenant.tenantId,
      adminToken,
      adminId: admin.platformUserId,
    };
  }

  it("happy path: admin requests info -> message set, status still pending, email sent, audit written", async () => {
    const { proofId, tenantId, adminToken, adminId } = await setupSubscriptionProof();

    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/request-info`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ message: "Please clarify the bank reference number on your receipt." });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.info_requested_message).toBe(
      "Please clarify the bank reference number on your receipt.",
    );
    expect(res.body.info_requested_at).toEqual(expect.any(String));

    // DB row.
    const row = await adminPrisma.paymentProof.findUnique({ where: { id: proofId } });
    expect(row!.status).toBe("pending");
    expect(row!.info_requested_message).toBe(
      "Please clarify the bank reference number on your receipt.",
    );
    expect(row!.info_requested_at).not.toBeNull();

    // Email on disk.
    // Give the fire-and-forget a moment to flush.
    await new Promise((r) => setTimeout(r, 500));
    const files = await fs.readdir(EMAIL_DIR);
    const emailFile = files.find((f) => f.includes("payment_proof_info_requested"));
    expect(emailFile).toBeTruthy();
    if (emailFile) {
      const contents = await fs.readFile(path.join(EMAIL_DIR, emailFile), "utf8");
      expect(contents).toContain("X-Madar-Template: payment_proof_info_requested");
    }

    // Platform audit.
    const audit = await readPlatformAudit(adminId, "admin_proof_info_requested");
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect((audit[0]!.metadata as Record<string, unknown>).message).toBe(
      "Please clarify the bank reference number on your receipt.",
    );
  });

  it("request-info on a verified proof -> 422 proof_not_pending", async () => {
    const { proofId, adminToken } = await setupSubscriptionProof();

    // Verify the proof first.
    await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/verify`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Try request-info on verified proof.
    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/request-info`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ message: "Some question" });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "proof_not_pending" });
  });

  it("empty message -> 400", async () => {
    const { proofId, adminToken } = await setupSubscriptionProof();

    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/request-info`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ message: "" });

    expect(res.status).toBe(400);
  });
});
