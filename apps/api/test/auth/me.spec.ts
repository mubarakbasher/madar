import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant } from "../helpers/fixtures";

describe("GET /v1/auth/me", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns 401 with code 'access_missing' when no Authorization header", async () => {
    const res = await request(booted.http).get("/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_missing" });
  });

  it("returns 401 with code 'access_expired' for a garbage bearer token", async () => {
    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "access_expired" });
  });

  it("returns 200 with user + tenant for a valid access token; never leaks token fields", async () => {
    const t = await makeTenant({ slugPrefix: "me" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });

    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: t.userId,
      email: t.email,
      role: "owner",
      locale: "en",
    });
    expect(res.body.tenant).toMatchObject({
      id: t.tenantId,
      slug: t.slug,
      status: "trialing",
      default_currency_code: "USD",
      country_code: "EG",
    });
    expect(res.body.tenant.plan).toMatchObject({ code: "starter" });
    // /me must never echo tokens back.
    expect(res.body).not.toHaveProperty("access_token");
    expect(res.body).not.toHaveProperty("refresh_token");
  });
});
