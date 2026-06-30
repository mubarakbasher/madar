/**
 * Tenant subscription-status gate. When `tenant.status` is `suspended` or
 * `cancelled`, write requests (POST/PATCH/DELETE) are rejected with 423
 * `tenant_suspended` except for the allowlist (logout, refresh, payment-proof
 * submission, impersonation exit). Reads remain open so the tenant can
 * export data + pay.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { RedisService } from "../../src/common/redis.service";
import { invalidateTenantStatus } from "../../src/tenant/auth/tenant-status.cache";
import { makeTenant } from "../helpers/fixtures";

async function setStatus(
  tenantId: string,
  status: "active" | "grace_period" | "suspended" | "cancelled" | "trialing",
  redis: RedisService,
): Promise<void> {
  await adminPrisma.tenant.update({ where: { id: tenantId }, data: { status } });
  await invalidateTenantStatus(tenantId, redis);
}

describe("Tenant subscription-status gate (A3)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let redis: RedisService;
  let tenant: Awaited<ReturnType<typeof makeTenant>>;
  let ownerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    redis = booted.app.get(RedisService);
    tenant = await makeTenant({ slugPrefix: "status-gate", status: "active" });
    ownerToken = (
      await tokens.mintPair({ userId: tenant.userId, tenantId: tenant.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. active tenant: writes allowed ───────────────────────────────────

  it("active tenant: POST /v1/customers succeeds (200/201)", async () => {
    await setStatus(tenant.tenantId, "active", redis);
    const res = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Active-state customer" });
    expect(res.status).toBe(201);
  });

  // ─── 2. suspended tenant: writes blocked with 423 ───────────────────────

  it("suspended tenant: POST /v1/customers returns 423 tenant_suspended", async () => {
    await setStatus(tenant.tenantId, "suspended", redis);
    const res = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Blocked customer" });
    expect(res.status).toBe(423);
    expect(res.body.code).toBe("tenant_suspended");
    expect(res.body.status).toBe("suspended");
  });

  // ─── 3. suspended tenant: reads + allowlist still work ─────────────────

  it("suspended tenant: GET /v1/customers + /v1/auth/me still 200, logout allowed", async () => {
    await setStatus(tenant.tenantId, "suspended", redis);

    const list = await request(booted.http)
      .get("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);

    const me = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(me.status).toBe(200);
    expect(me.body.tenant.status).toBe("suspended");

    // Logout is on the write-allowlist so a suspended tenant can sign out.
    const logout = await request(booted.http)
      .post("/v1/auth/logout")
      .set("Authorization", `Bearer ${ownerToken}`);
    // Logout returns 200 OR 204 depending on cookie state; both are fine
    // — what matters is that it's NOT 423.
    expect(logout.status).not.toBe(423);
  });

  // ─── 3b. cancelled tenant: same read-open / write-blocked gate ──────────

  it("cancelled tenant: writes 423 but reads + /v1/auth/me stay 200", async () => {
    await setStatus(tenant.tenantId, "cancelled", redis);

    const write = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Cancelled-state customer" });
    expect(write.status).toBe(423);
    expect(write.body.code).toBe("tenant_suspended");
    expect(write.body.status).toBe("cancelled");

    const list = await request(booted.http)
      .get("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);

    const me = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(me.status).toBe(200);
    expect(me.body.tenant.status).toBe("cancelled");
  });

  // ─── 4. invalidate via billing-tracker path: restore unblocks writes ───

  it("after status flips back to active and cache is invalidated, writes unblock", async () => {
    await setStatus(tenant.tenantId, "suspended", redis);
    const blocked = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Should be blocked" });
    expect(blocked.status).toBe(423);

    await setStatus(tenant.tenantId, "active", redis);
    const unblocked = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Should succeed" });
    expect(unblocked.status).toBe(201);
  });
});
