import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { AdminTokenService } from "../../src/admin/auth/admin-token.service";
import { makePlatformUser } from "../helpers/admin-fixtures";

/**
 * Realm canary: an admin-realm token MUST NOT pass through tenant-scoped
 * payment-proof endpoints (those go through TenantAuthGuard).
 */
describe("realm-canary — payment-proof tenant endpoints reject admin tokens", () => {
  let booted: BootedTestApp;
  let adminToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    const a = await makePlatformUser({ emailPrefix: "proof-canary" });
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
  });

  it("/v1/payment-proofs (list) rejects an admin-realm access token", async () => {
    const res = await request(booted.http)
      .get("/v1/payment-proofs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });

  it("/v1/payment-proofs (POST) rejects an admin-realm access token", async () => {
    const res = await request(booted.http)
      .post("/v1/payment-proofs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });
});
