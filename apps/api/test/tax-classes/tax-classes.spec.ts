import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenant,
  makeTenantWithCatalog,
  readAuditLog,
  type TenantFixture,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

describe("Tax classes (/v1/tax-classes)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;
  let accountantToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "tax-cls" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const accountant = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `acct-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Accountant",
        role: "accountant",
        locale: "en",
      },
    });
    accountantToken = (
      await tokens.mintPair({
        userId: accountant.id,
        tenantId: t.tenantId,
        role: "accountant",
      })
    ).access_token;

    otherTenant = await makeTenant({ slugPrefix: "tax-rls" });
    otherOwnerToken = (
      await tokens.mintPair({
        userId: otherTenant.userId,
        tenantId: otherTenant.tenantId,
        role: "owner",
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("POST happy: owner creates a tax class + audit row", async () => {
    const res = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Standard VAT", ar: "ضريبة القيمة المضافة" },
        rate_bps: 1500,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.code).toMatch(/^VAT-/);
    expect(res.body.rate_bps).toBe(1500);
    expect(res.body.is_active).toBe(true);
    expect(res.body.is_default).toBe(false);

    const audit = await readAuditLog(t.tenantId, "tax_class_created");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]!.after).toMatchObject({ rate_bps: 1500 });
  });

  it("POST 409 tax_class_code_taken on duplicate code", async () => {
    const code = `VAT-${randomUUID().slice(0, 4).toUpperCase()}`;
    const a = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "A", ar: "أ" }, rate_bps: 1000 });
    expect(a.status).toBe(201);

    const b = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "B", ar: "ب" }, rate_bps: 2000 });
    expect(b.status).toBe(409);
    expect(b.body.code).toBe("tax_class_code_taken");
  });

  it("POST 400 on invalid rate_bps", async () => {
    const res = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Bad", ar: "سيء" },
        rate_bps: 200_000,
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("POST 403 as cashier", async () => {
    const res = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Cashier Tried", ar: "حاول" },
        rate_bps: 500,
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH happy + audit", async () => {
    const create = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Patch Me", ar: "حدثني" },
        rate_bps: 1400,
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const patch = await request(booted.http)
      .patch(`/v1/tax-classes/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rate_bps: 1600, is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.rate_bps).toBe(1600);
    expect(patch.body.is_active).toBe(false);

    const audit = await readAuditLog(t.tenantId, "tax_class_updated");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("POST /:id/set-default sets the tenant default + audit", async () => {
    const create = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Default Pick", ar: "افتراضي" },
        rate_bps: 1400,
      });
    const id = create.body.id as string;

    const setDef = await request(booted.http)
      .post(`/v1/tax-classes/${id}/set-default`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(setDef.status).toBe(200);
    expect(setDef.body.is_default).toBe(true);

    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: t.tenantId },
      select: { default_tax_class_id: true },
    });
    expect(tenant?.default_tax_class_id).toBe(id);

    // Idempotent: a second set-default is OK.
    const setDef2 = await request(booted.http)
      .post(`/v1/tax-classes/${id}/set-default`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(setDef2.status).toBe(200);
    expect(setDef2.body.is_default).toBe(true);

    const audit = await readAuditLog(t.tenantId, "tax_class_default_set");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("DELETE refuses if class is the default", async () => {
    // Reuse: whatever was just set as default.
    const tenant = await adminPrisma.tenant.findUnique({
      where: { id: t.tenantId },
      select: { default_tax_class_id: true },
    });
    const defaultId = tenant?.default_tax_class_id;
    expect(defaultId).toBeTruthy();

    const res = await request(booted.http)
      .delete(`/v1/tax-classes/${defaultId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("tax_class_in_use");
  });

  it("DELETE refuses if a product references it", async () => {
    const create = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Used", ar: "مستخدم" },
        rate_bps: 1000,
      });
    const id = create.body.id as string;

    // Attach to a tenant product.
    await adminPrisma.product.update({
      where: { id: t.products[0]!.id },
      data: { tax_class_id: id },
    });

    const res = await request(booted.http)
      .delete(`/v1/tax-classes/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("tax_class_in_use");

    // Cleanup: detach.
    await adminPrisma.product.update({
      where: { id: t.products[0]!.id },
      data: { tax_class_id: null },
    });
  });

  it("DELETE happy + idempotent", async () => {
    const create = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Bye", ar: "وداعا" },
        rate_bps: 500,
      });
    const id = create.body.id as string;

    const r1 = await request(booted.http)
      .delete(`/v1/tax-classes/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();

    // Second DELETE → 404 (soft-deleted is now hidden via loadOr404).
    const r2 = await request(booted.http)
      .delete(`/v1/tax-classes/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(404);
    expect(r2.body.code).toBe("tax_class_not_found");
  });

  it("RLS canary: tenant B cannot see tenant A's tax class", async () => {
    const create = await request(booted.http)
      .post("/v1/tax-classes")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `VAT-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Hidden", ar: "مخفي" },
        rate_bps: 700,
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const peek = await request(booted.http)
      .get(`/v1/tax-classes/${id}`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(peek.status).toBe(404);
  });

  it("Reader endpoints: 200 for accountant, 403 for cashier", async () => {
    const acctList = await request(booted.http)
      .get("/v1/tax-classes")
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(acctList.status).toBe(200);
    expect(Array.isArray(acctList.body.items)).toBe(true);

    const cashierList = await request(booted.http)
      .get("/v1/tax-classes")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(cashierList.status).toBe(403);
    expect(cashierList.body.code).toBe("forbidden_role");
  });
});
