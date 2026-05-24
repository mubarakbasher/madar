import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makePlatformUser, readPlatformAudit } from "../helpers/admin-fixtures";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";

// Set a deterministic test encryption key before the app boots.
const TEST_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.PLATFORM_BANK_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

describe("Admin Bank Accounts CRUD", () => {
  let booted: BootedTestApp;
  let tokens: AdminTokenService;
  let ownerToken: string;
  let ownerUserId: string;
  let financeToken: string;
  let financeUserId: string;
  let supportToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(AdminTokenService);

    const owner = await makePlatformUser({ emailPrefix: "ba-owner", role: "owner" });
    ownerUserId = owner.platformUserId;
    const ownerPair = await tokens.mintAccessPair({
      platformUserId: owner.platformUserId,
      email: owner.email,
      role: owner.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    ownerToken = ownerPair.access_token;

    const finance = await makePlatformUser({ emailPrefix: "ba-finance", role: "finance" });
    financeUserId = finance.platformUserId;
    const financePair = await tokens.mintAccessPair({
      platformUserId: finance.platformUserId,
      email: finance.email,
      role: finance.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    financeToken = financePair.access_token;

    const support = await makePlatformUser({ emailPrefix: "ba-support", role: "support" });
    const supportPair = await tokens.mintAccessPair({
      platformUserId: support.platformUserId,
      email: support.email,
      role: support.role,
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    });
    supportToken = supportPair.access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  const validPayload = {
    bank_name: "National Bank of Egypt",
    account_holder: "Madar Platform LLC",
    account_number: "1234567890123456",
    iban: "EG380019000500000000263180002",
    swift: "NBEGEGCX",
    currency_code: "EGP",
    country_code: "EG",
    name_en: "Primary EGP Account",
    notes_en: "For Egyptian tenants",
  };

  it("401 when no auth header", async () => {
    const res = await request(booted.http).get("/v1/admin/bank-accounts");
    expect(res.status).toBe(401);
  });

  it("create: 403 for non-owner (support role)", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/bank-accounts")
      .set("Authorization", `Bearer ${supportToken}`)
      .send(validPayload);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "insufficient_permission" });
  });

  let createdId: string;

  it("create: happy path as owner", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/bank-accounts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      bank_name: "National Bank of Egypt",
      account_holder: "Madar Platform LLC",
      account_number_last4: "3456",
      iban_last4: "0002",
      swift: "NBEGEGCX",
      currency_code: "EGP",
      country_code: "EG",
      is_active: true,
    });
    // Never exposes encrypted field
    expect(res.body).not.toHaveProperty("account_number_encrypted");
    expect(res.body).not.toHaveProperty("account_number");
    createdId = res.body.id;

    // Verify audit
    const audit = await readPlatformAudit(ownerUserId, "bank_account.created");
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("list: returns masked accounts (no encrypted field)", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/bank-accounts")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const account = res.body.find((a: { id: string }) => a.id === createdId);
    expect(account).toBeDefined();
    expect(account).not.toHaveProperty("account_number_encrypted");
    expect(account.account_number_last4).toBe("3456");
  });

  it("get: returns single masked account by ID", async () => {
    const res = await request(booted.http)
      .get(`/v1/admin/bank-accounts/${createdId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdId);
    expect(res.body.bank_name).toBe("National Bank of Egypt");
    expect(res.body).not.toHaveProperty("account_number_encrypted");
  });

  it("update: finance role can update", async () => {
    const res = await request(booted.http)
      .patch(`/v1/admin/bank-accounts/${createdId}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ bank_name: "NBE Updated" });

    expect(res.status).toBe(200);
    expect(res.body.bank_name).toBe("NBE Updated");

    const audit = await readPlatformAudit(financeUserId, "bank_account.updated");
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("update: re-encrypts account_number when provided", async () => {
    const res = await request(booted.http)
      .patch(`/v1/admin/bank-accounts/${createdId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ account_number: "9999888877776666" });

    expect(res.status).toBe(200);
    expect(res.body.account_number_last4).toBe("6666");
  });

  it("disable: toggles is_active to false", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/bank-accounts/${createdId}/disable`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);

    const audit = await readPlatformAudit(ownerUserId, "bank_account.disabled");
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("enable: toggles is_active to true", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/bank-accounts/${createdId}/enable`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);

    const audit = await readPlatformAudit(ownerUserId, "bank_account.enabled");
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("reveal: returns full account number + writes audit", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/bank-accounts/${createdId}/reveal`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ account_number: "9999888877776666" });

    const audit = await readPlatformAudit(ownerUserId, "bank_account.revealed");
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("reveal: 403 for non-owner", async () => {
    const res = await request(booted.http)
      .post(`/v1/admin/bank-accounts/${createdId}/reveal`)
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "insufficient_permission" });
  });

  it("get: 404 for non-existent ID", async () => {
    const res = await request(booted.http)
      .get("/v1/admin/bank-accounts/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "bank_account_not_found" });
  });

  it("create: 400 for invalid payload", async () => {
    const res = await request(booted.http)
      .post("/v1/admin/bank-accounts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ bank_name: "" });

    expect(res.status).toBe(400);
  });
});
