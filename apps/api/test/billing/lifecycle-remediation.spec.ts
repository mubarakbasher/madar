/**
 * Audit-remediation lifecycle coverage (H-2, H-3, M-12):
 *  - submitting a subscription proof parks the invoice at in_review, so the
 *    daily tick stops advancing the tenant toward suspension;
 *  - rejecting reverts in_review → awaiting_payment;
 *  - verifying pays the invoice and restores a suspended tenant to active;
 *  - the platform owner can manually override a tenant's status (audited),
 *    other admin roles cannot;
 *  - suspended tenants cannot mutate SALE-context proofs even though the
 *    /v1/payment-proofs prefix is allowlisted for subscription payments.
 */
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

describe("Billing lifecycle remediation (H-2, H-3, M-12)", () => {
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

  async function mintTenantToken(t: { userId: string; tenantId: string }): Promise<string> {
    return (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;
  }

  async function mintAdminToken(role: "owner" | "support" = "owner") {
    const admin = await makePlatformUser({ emailPrefix: `lc-${role}-${randomUUID().slice(0, 4)}`, role });
    const token = (
      await booted.app.get(AdminTokenService).mintAccessPair({
        platformUserId: admin.platformUserId,
        email: admin.email,
        role: admin.role,
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
      })
    ).access_token;
    return { admin, token };
  }

  async function submitSubscriptionProof(
    tenant: { userId: string; tenantId: string },
    invoiceId: string,
  ): Promise<string> {
    const bank = await makePlatformBankAccount();
    const jpg = await tinyJpegBuffer();
    const res = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${await mintTenantToken(tenant)}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "subscription")
      .field("reference_id", invoiceId)
      .field("amount_cents", "4900")
      .field("currency_code", "USD")
      .field("bank_account_kind", "platform")
      .field("bank_account_id", bank.id)
      .field("payer_name", "Tenant Owner")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", `WIRE-${randomUUID().slice(0, 6)}`)
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // ─── H-3: submit parks the invoice in_review; the tick leaves it alone ──

  it("subscription proof submit moves the invoice to in_review and the daily tick does not suspend the tenant", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-inreview" });
    const plan = await seedStarterPlan();
    // Invoice 40 days past due — without in_review the tick would cancel.
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "overdue",
      dueDate: new Date(Date.now() - 40 * 86_400_000),
    });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { status: "active" },
    });

    await submitSubscriptionProof(tenant, invoice.id);

    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("in_review");

    const { token } = await mintAdminToken("owner");
    const tick = await request(booted.http)
      .post("/v1/admin/billing/tick")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID());
    expect(tick.status).toBe(200);

    const t = await adminPrisma.tenant.findUnique({ where: { id: tenant.tenantId } });
    expect(t!.status).toBe("active");
  });

  // ─── H-3: reject reverts in_review → awaiting_payment ──────────────────

  it("rejecting a subscription proof reverts the invoice to awaiting_payment", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-rej" });
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "awaiting_payment",
    });
    const proofId = await submitSubscriptionProof(tenant, invoice.id);

    const { token } = await mintAdminToken("owner");
    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rejection_reason: "illegible receipt" });
    expect(res.status).toBe(200);

    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("awaiting_payment");
  });

  // ─── H-2: verify pays the invoice and restores a suspended tenant ──────

  it("verifying the last unpaid invoice restores a suspended tenant to active", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-restore" });
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "overdue",
      dueDate: new Date(Date.now() - 10 * 86_400_000),
    });
    const proofId = await submitSubscriptionProof(tenant, invoice.id);
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { status: "suspended" },
    });

    const { token } = await mintAdminToken("owner");
    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/verify`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("paid");

    const t = await adminPrisma.tenant.findUnique({ where: { id: tenant.tenantId } });
    expect(t!.status).toBe("active");
  });

  // ─── verify also restores a cancelled tenant (pre-archival recovery) ────

  it("verifying the last unpaid invoice restores a cancelled tenant to active", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-restore-canc" });
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "overdue",
      dueDate: new Date(Date.now() - 35 * 86_400_000),
    });
    const proofId = await submitSubscriptionProof(tenant, invoice.id);
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { status: "cancelled" },
    });

    const { token } = await mintAdminToken("owner");
    const res = await request(booted.http)
      .post(`/v1/admin/payment-proofs/${proofId}/verify`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const inv = await adminPrisma.subscriptionInvoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe("paid");

    const t = await adminPrisma.tenant.findUnique({ where: { id: tenant.tenantId } });
    expect(t!.status).toBe("active");
  });

  // ─── H-2: manual override endpoint ──────────────────────────────────────

  it("platform owner can override tenant status with a reason; support role cannot", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-override" });
    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { status: "suspended" },
    });

    const support = await mintAdminToken("support");
    const denied = await request(booted.http)
      .patch(`/v1/admin/tenants/${tenant.tenantId}/status`)
      .set("Authorization", `Bearer ${support.token}`)
      .send({ status: "active", reason: "goodwill reactivation after dispute" });
    expect(denied.status).toBe(403);

    const owner = await mintAdminToken("owner");
    const ok = await request(booted.http)
      .patch(`/v1/admin/tenants/${tenant.tenantId}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "active", reason: "goodwill reactivation after dispute" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("active");

    const t = await adminPrisma.tenant.findUnique({ where: { id: tenant.tenantId } });
    expect(t!.status).toBe("active");

    const audit = await readPlatformAudit(owner.admin.platformUserId, "tenant_status_override");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.target_tenant_id).toBe(tenant.tenantId);
  });

  // ─── M-12: suspended tenants cannot mutate sale-context proofs ──────────

  it("suspended tenant gets 423 submitting a SALE-context proof while subscription submission stays open", async () => {
    const tenant = await makeTenant({ slugPrefix: "lc-salelock" });
    const tenantToken = await mintTenantToken(tenant);

    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: tenant.tenantId,
        code: "br-lock",
        name_i18n: { en: "L", ar: "L" },
        currency_code: "USD",
      },
    });
    const sale = await adminPrisma.sale.create({
      data: {
        tenant_id: tenant.tenantId,
        branch_id: branch.id,
        code: `TX-${randomUUID().slice(0, 6)}`,
        cashier_id: tenant.userId,
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
        tenant_id: tenant.tenantId,
        name_i18n: { en: "L", ar: "L" },
        bank_name: "L",
        account_holder: "L",
        account_number_last4: "0000",
        account_number_encrypted: "x",
        currency_code: "USD",
      },
    });

    await adminPrisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { status: "suspended" },
    });

    const jpg = await tinyJpegBuffer();
    const res = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", randomUUID())
      .field("context", "sale")
      .field("reference_id", sale.id)
      .field("amount_cents", "1000")
      .field("currency_code", "USD")
      .field("bank_account_kind", "tenant")
      .field("bank_account_id", bank.id)
      .field("payer_name", "L")
      .field("transfer_date", "2026-05-15")
      .field("transfer_reference", "TR-LOCK")
      .attach("receipt", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(423);
    expect(res.body.code).toBe("tenant_suspended");

    // Subscription proofs (the road back) must remain open.
    const plan = await seedStarterPlan();
    const invoice = await makeSubscriptionInvoice(tenant.tenantId, plan.id, {
      status: "awaiting_payment",
    });
    await submitSubscriptionProof(tenant, invoice.id);
  });
});
