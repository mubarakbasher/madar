import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { parseSetCookie, REFRESH_COOKIE_NAME } from "../helpers/cookies";
import { readAuditLog, uniqueEmail, uniqueSlug } from "../helpers/fixtures";

const VALID_PASSWORD = "Password123!";

function signupBody(overrides: Partial<{
  business_name: string;
  slug: string;
  owner_name: string;
  email: string;
  password: string;
  country_code: string;
  default_currency_code: string;
  default_locale: "en" | "ar";
}> = {}) {
  return {
    business_name: "Bayt Coffee Co.",
    slug: uniqueSlug("shop"),
    owner_name: "Mariam Saleh",
    email: uniqueEmail("owner"),
    password: VALID_PASSWORD,
    country_code: "EG",
    default_currency_code: "EGP",
    default_locale: "en" as const,
    ...overrides,
  };
}

describe("POST /v1/auth/signup", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("creates tenant + owner, returns access_token, sets refresh cookie, writes signup_complete audit", async () => {
    const body = signupBody();
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.expires_in).toBeGreaterThan(0);
    expect(res.body.user).toMatchObject({ email: body.email, role: "owner", name: body.owner_name });
    expect(res.body.tenant).toMatchObject({
      slug: body.slug,
      status: "trialing",
      default_currency_code: "EGP",
      country_code: "EG",
    });
    expect(res.body.tenant.plan).toBeNull();

    const cookie = parseSetCookie(res, REFRESH_COOKIE_NAME);
    expect(cookie).not.toBeNull();
    expect(cookie!.value.length).toBeGreaterThan(0);
    expect(cookie!.attrs.httponly).toBe(true);
    expect(String(cookie!.attrs.samesite).toLowerCase()).toBe("lax");
    expect(cookie!.attrs.path).toBe("/");
    expect(Number(cookie!.attrs["max-age"])).toBeGreaterThan(0);

    const tenant = await adminPrisma.tenant.findUnique({ where: { slug: body.slug } });
    expect(tenant).not.toBeNull();
    const audit = await readAuditLog(tenant!.id, "signup_complete");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entity).toBe("user");
  });

  it("replays an Idempotency-Key: identical 201 body, NO duplicate tenant or audit row", async () => {
    const body = signupBody();
    const key = randomUUID();

    const r1 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", key)
      .send(body);
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", key)
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.access_token).toBe(r1.body.access_token);
    expect(r2.body.tenant.id).toBe(r1.body.tenant.id);

    const tenants = await adminPrisma.tenant.findMany({ where: { slug: body.slug } });
    expect(tenants).toHaveLength(1);
    const audit = await readAuditLog(tenants[0]!.id, "signup_complete");
    expect(audit).toHaveLength(1);
  });

  it("rejects a missing Idempotency-Key with 400", async () => {
    const res = await request(booted.http).post("/v1/auth/signup").send(signupBody());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "idempotency_key_required" });
  });

  it("rejects a non-UUID Idempotency-Key with 400", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", "not-a-uuid")
      .send(signupBody());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "idempotency_key_invalid" });
  });

  it("returns 409 slug_taken when the slug is already used", async () => {
    const first = signupBody();
    const r1 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(first);
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(signupBody({ slug: first.slug }));
    expect(r2.status).toBe(409);
    expect(r2.body).toMatchObject({ code: "slug_taken" });
  });

  it("returns 409 email_taken when the email is already used by another tenant", async () => {
    const first = signupBody();
    const r1 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(first);
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(signupBody({ email: first.email }));
    expect(r2.status).toBe(409);
    expect(r2.body).toMatchObject({ code: "email_taken" });
  });

  it("returns 409 slug_reserved for a slug in the reserved set", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(signupBody({ slug: "admin" }));
    // The slug-reserved check fires inside the service after zod validation —
    // 'admin' is a valid slug shape (lowercase, hyphenable) so we get 409.
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "slug_reserved" });
  });

  it("returns 400 from zod for an invalid email", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(signupBody({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 from zod for a weak password (no digit)", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send(signupBody({ password: "onlyletters" }));
    expect(res.status).toBe(400);
  });
});
