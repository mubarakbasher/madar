import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makeTenant, uniqueSlug } from "../helpers/fixtures";

describe("GET /v1/auth/slug-available", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns available:true for an unused slug", async () => {
    const slug = uniqueSlug("free");
    const res = await request(booted.http).get("/v1/auth/slug-available").query({ slug });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it("returns available:false, reason:taken for an existing slug", async () => {
    const t = await makeTenant({ slugPrefix: "taken" });
    const res = await request(booted.http).get("/v1/auth/slug-available").query({ slug: t.slug });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "taken" });
  });

  it("returns available:false, reason:reserved for a reserved slug", async () => {
    const res = await request(booted.http).get("/v1/auth/slug-available").query({ slug: "admin" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, reason: "reserved" });
  });

  it("returns 400 for an invalid slug shape", async () => {
    const res = await request(booted.http)
      .get("/v1/auth/slug-available")
      .query({ slug: "NotALowerCaseSlug" });
    expect(res.status).toBe(400);
  });

  it("does NOT rate-limit in test mode (NODE_ENV=test)", async () => {
    // Sanity: the rate-limit guard short-circuits when NODE_ENV !== 'production'.
    // Hammer the endpoint past the configured ceiling (30/min) and confirm no 429.
    const slug = uniqueSlug("rl");
    let lastStatus = 0;
    for (let i = 0; i < 35; i++) {
      const res = await request(booted.http).get("/v1/auth/slug-available").query({ slug });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(200);
  });

  it("enforces the 30/min IP bucket when NODE_ENV=production", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const slug = uniqueSlug("rlprod");
      let saw429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await request(booted.http).get("/v1/auth/slug-available").query({ slug });
        if (res.status === 429) {
          saw429 = true;
          expect(res.body).toMatchObject({ code: "rate_limited" });
          break;
        }
      }
      expect(saw429).toBe(true);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
