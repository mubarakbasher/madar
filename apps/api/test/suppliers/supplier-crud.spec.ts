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

describe("Supplier CRUD (/v1/suppliers)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;
  let accountantToken: string;
  let impersonatorToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "supp-crud" });
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

    // Impersonation token (owner with impersonator_id set).
    impersonatorToken = (
      await tokens.mintImpersonationAccess({
        tenantId: t.tenantId,
        targetUserId: t.userId,
        targetRole: "owner",
        impersonatorId: randomUUID(),
        impersonatorEmail: "admin@platform.test",
      })
    ).access_token;

    // Second tenant for RLS canary.
    otherTenant = await makeTenant({ slugPrefix: "supp-rls" });
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

  it("POST happy: owner creates a supplier + audit row written", async () => {
    const res = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Acme Supplies", ar: "أكمي" },
        currency_code: "USD",
        country_code: "EG",
        lead_time_days: 7,
        contact_email: "rep@acme.test",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.code).toMatch(/^SUP-/);
    expect(res.body.is_active).toBe(true);
    expect(res.body.stats).toBeTruthy();
    expect(res.body.recent_activity).toEqual(expect.any(Array));

    const audit = await readAuditLog(t.tenantId, "supplier_created");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]!.after).toMatchObject({ currency_code: "USD" });
  });

  it("POST 409 on duplicate code", async () => {
    const code = `SUP-${randomUUID().slice(0, 4).toUpperCase()}`;
    const a = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code,
        name_i18n: { en: "Dup A", ar: "دوب أ" },
      });
    expect(a.status).toBe(201);

    const b = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code,
        name_i18n: { en: "Dup B", ar: "دوب ب" },
      });
    expect(b.status).toBe(409);
    expect(b.body.code).toBe("code_taken");
  });

  it("POST 400 on missing name_i18n.ar", async () => {
    const res = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Only EN" },
      });
    expect(res.status).toBe(400);
  });

  it("POST 403 as cashier", async () => {
    const res = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Cashier Tried", ar: "حاول الصراف" },
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH happy + audit", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Patch Me", ar: "حدثني" },
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const patch = await request(booted.http)
      .patch(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        contact_email: "new@acme.test",
        lead_time_days: 14,
      });
    expect(patch.status).toBe(200);
    expect(patch.body.contact_email).toBe("new@acme.test");
    expect(patch.body.lead_time_days).toBe(14);

    const audit = await readAuditLog(t.tenantId, "supplier_updated");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("PATCH 404 unknown id", async () => {
    const res = await request(booted.http)
      .patch(`/v1/suppliers/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ contact_email: "x@y.test" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("supplier_not_found");
  });

  it("DELETE happy + idempotent (second DELETE returns 200)", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Bye", ar: "وداعا" },
      });
    const id = create.body.id as string;

    const r1 = await request(booted.http)
      .delete(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();

    const r2 = await request(booted.http)
      .delete(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(200);
    expect(r2.body.deleted_at).toBeTruthy();
  });

  it("DELETE 409 supplier_has_open_pos when a PO is in draft", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Has POs", ar: "لديه أوامر" },
      });
    const supplierId = create.body.id as string;

    await adminPrisma.purchaseOrder.create({
      data: {
        tenant_id: t.tenantId,
        supplier_id: supplierId,
        branch_id: t.branchId,
        code: `PO-${randomUUID().slice(0, 6).toUpperCase()}`,
        status: "draft",
        currency_code: "USD",
      },
    });

    const res = await request(booted.http)
      .delete(`/v1/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("supplier_has_open_pos");
  });

  it("DELETE 403 during impersonation", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Imp", ar: "انتحال" },
      });
    const id = create.body.id as string;

    const res = await request(booted.http)
      .delete(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${impersonatorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });

  it("RLS canary: tenant B cannot see tenant A's supplier", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Hidden", ar: "مخفي" },
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const peek = await request(booted.http)
      .get(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(peek.status).toBe(404);
  });

  it("Reader endpoints: 200 for accountant on list/detail, 403 for cashier", async () => {
    const create = await request(booted.http)
      .post("/v1/suppliers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `SUP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Reader Test", ar: "اختبار قارئ" },
      });
    const id = create.body.id as string;

    const acctList = await request(booted.http)
      .get("/v1/suppliers")
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(acctList.status).toBe(200);
    expect(Array.isArray(acctList.body.items)).toBe(true);

    const acctDetail = await request(booted.http)
      .get(`/v1/suppliers/${id}`)
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(acctDetail.status).toBe(200);

    const cashierList = await request(booted.http)
      .get("/v1/suppliers")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(cashierList.status).toBe(403);
    expect(cashierList.body.code).toBe("forbidden_role");
  });
});
