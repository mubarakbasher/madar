/**
 * Business settings (PAGES §46) — GET + PATCH /v1/tenant.
 *
 * Covers the snapshot shape on GET (open to any authed user), the owner-only
 * gate on PATCH, the diff-only audit row, and validation branches
 * (invalid_timezone, currency regex, empty body).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

describe("Business settings (/v1/tenant) — PAGES §46", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  let fix: Awaited<ReturnType<typeof makeTenant>>;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    fix = await makeTenant({ slugPrefix: "biz" });
    ownerToken = (
      await tokens.mintPair({ userId: fix.userId, tenantId: fix.tenantId, role: "owner" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: fix.tenantId,
        email: `biz-cash-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: fix.tenantId, role: "cashier" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── GET ─────────────────────────────────────────────────────────────

  it("GET /v1/tenant: returns the full snapshot for the owner", async () => {
    const res = await request(booted.http)
      .get("/v1/tenant")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fix.tenantId);
    expect(res.body.slug).toBe(fix.slug);
    expect(res.body.country_code).toBe("EG");
    expect(res.body.default_currency_code).toBe("USD");
    expect(res.body.timezone).toBe("Africa/Cairo");
    expect(res.body.fiscal_year_start_month).toBe(1);
    expect(res.body.tax_inclusive_default).toBe(false);
    expect(res.body.legal_name).toBeNull();
    expect(res.body.business_type).toBeNull();
    expect(res.body.plan).toEqual(
      expect.objectContaining({ code: "starter" }),
    );
  });

  it("GET /v1/tenant: any authed user can read (cashier ok)", async () => {
    const res = await request(booted.http)
      .get("/v1/tenant")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fix.tenantId);
  });

  // ─── PATCH gates ────────────────────────────────────────────────────

  it("PATCH /v1/tenant: cashier 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .patch("/v1/tenant")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ legal_name: "Anything Ltd" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH /v1/tenant: empty body 400", async () => {
    const res = await request(booted.http)
      .patch("/v1/tenant")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /v1/tenant: invalid currency code shape 400 (zod regex)", async () => {
    const res = await request(booted.http)
      .patch("/v1/tenant")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ default_currency_code: "usd" });
    expect(res.status).toBe(400);
  });

  it("PATCH /v1/tenant: invalid_timezone 400 + row unchanged", async () => {
    const beforeRow = await adminPrisma.tenant.findUnique({
      where: { id: fix.tenantId },
    });
    const res = await request(booted.http)
      .patch("/v1/tenant")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ timezone: "Mars/Olympus" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_timezone");
    const afterRow = await adminPrisma.tenant.findUnique({
      where: { id: fix.tenantId },
    });
    expect(afterRow?.timezone).toBe(beforeRow?.timezone);
  });

  // ─── PATCH happy ────────────────────────────────────────────────────

  it("PATCH /v1/tenant happy: applies diff + audit carries before/after", async () => {
    const res = await request(booted.http)
      .patch("/v1/tenant")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        legal_name: "Bayt Coffee Co. Limited",
        business_type: "restaurant",
        fiscal_year_start_month: 7,
        tax_inclusive_default: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.legal_name).toBe("Bayt Coffee Co. Limited");
    expect(res.body.business_type).toBe("restaurant");
    expect(res.body.fiscal_year_start_month).toBe(7);
    expect(res.body.tax_inclusive_default).toBe(true);

    const row = await adminPrisma.tenant.findUnique({ where: { id: fix.tenantId } });
    expect(row?.legal_name).toBe("Bayt Coffee Co. Limited");
    expect(row?.business_type).toBe("restaurant");
    expect(row?.fiscal_year_start_month).toBe(7);

    const audit = await readAuditLog(fix.tenantId, "tenant_updated");
    expect(audit.length).toBeGreaterThan(0);
    const before = audit[0]!.before as Record<string, unknown>;
    const after = audit[0]!.after as Record<string, unknown>;
    expect(before.legal_name).toBeNull();
    expect(after.legal_name).toBe("Bayt Coffee Co. Limited");
    expect(after.business_type).toBe("restaurant");
    expect(after.fiscal_year_start_month).toBe(7);
    // Fields that didn't change shouldn't appear in the diff.
    expect(before).not.toHaveProperty("default_currency_code");
    expect(after).not.toHaveProperty("default_currency_code");
  });
});
