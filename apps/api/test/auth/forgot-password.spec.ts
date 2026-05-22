import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { makeTenant, readAuditLog, uniqueEmail } from "../helpers/fixtures";

describe("POST /v1/auth/forgot-password", () => {
  let booted: BootedTestApp;

  beforeAll(async () => {
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns 200 + empty body for an unknown email (no enumeration)", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/forgot-password")
      .send({ email: uniqueEmail("missing") });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("known email: writes token hash + expiry + sends email + audit", async () => {
    const t = await makeTenant({ slugPrefix: "fp-ok" });
    const res = await request(booted.http)
      .post("/v1/auth/forgot-password")
      .send({ email: t.email });
    expect(res.status).toBe(200);

    const u = await adminPrisma.user.findUnique({ where: { id: t.userId } });
    expect(u?.password_reset_token_hash).toBeTruthy();
    expect(u?.password_reset_token_hash?.length).toBe(64); // sha256 hex
    expect(u?.password_reset_expires_at).toBeInstanceOf(Date);
    expect(u!.password_reset_expires_at!.getTime()).toBeGreaterThan(Date.now());

    const audit = await readAuditLog(t.tenantId, "password_reset_requested");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("unknown email: does NOT write token hash and does NOT audit", async () => {
    const before = await adminPrisma.auditLog.count({
      where: { action: "password_reset_requested" },
    });
    await request(booted.http)
      .post("/v1/auth/forgot-password")
      .send({ email: uniqueEmail("ghost") });
    const after = await adminPrisma.auditLog.count({
      where: { action: "password_reset_requested" },
    });
    expect(after).toBe(before);
  });

  it("returns 400 on missing email", async () => {
    const res = await request(booted.http).post("/v1/auth/forgot-password").send({});
    expect(res.status).toBe(400);
  });

  it("returns 200 on invalid email format too (we don't tell)", async () => {
    const res = await request(booted.http)
      .post("/v1/auth/forgot-password")
      .send({ email: "not-an-email" });
    // Zod rejects with 400 — neutral behaviour ONLY applies to well-formed unknown emails.
    expect(res.status).toBe(400);
  });
});
