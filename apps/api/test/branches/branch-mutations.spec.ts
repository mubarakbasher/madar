import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, readAuditLog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Branch mutations (POST/PATCH/DELETE /v1/branches)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let cashierToken: string;
  let managerToken: string;
  let managerBranchId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "branch-mut" });
    ownerToken = (await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })).access_token;

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
    cashierToken = (await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })).access_token;

    // Manager is assigned to t.branchId — they can edit that branch but not others.
    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `manager-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Manager",
        role: "manager",
        locale: "en",
        branch_id: t.branchId,
      },
    });
    managerBranchId = t.branchId;
    managerToken = (await tokens.mintPair({ userId: manager.id, tenantId: t.tenantId, role: "manager" })).access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("POST /v1/branches happy: owner creates, audit row appears, defaults applied", async () => {
    const code = `BR-${randomUUID().slice(0, 4).toUpperCase()}`;
    const res = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code,
        name_i18n: { en: "Heliopolis", ar: "مصر الجديدة" },
        address_i18n: { en: "1 Korba St", ar: "كورنيش ١" },
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
    expect(res.body.name_i18n).toEqual({ en: "Heliopolis", ar: "مصر الجديدة" });
    expect(res.body.timezone).toBe("Africa/Cairo");
    expect(res.body.currency_code).toBe("USD"); // tenant default in test fixture
    expect(res.body.is_active).toBe(true);
    expect(res.body.kpis).toBeDefined();

    const audit = await readAuditLog(t.tenantId, "branch_created");
    expect(audit.some((r) => (r.after as { code?: string })?.code === code)).toBe(true);
  });

  it("POST /v1/branches duplicate code returns 409 code_taken", async () => {
    const code = `DUP-${randomUUID().slice(0, 4).toUpperCase()}`;
    const r1 = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "A", ar: "أ" } });
    expect(r1.status).toBe(201);
    const r2 = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "B", ar: "ب" } });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe("code_taken");
  });

  it("POST /v1/branches missing Arabic name returns 400", async () => {
    const res = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `MISS-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Only English", ar: "" },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("POST /v1/branches as cashier returns 403 forbidden_role", async () => {
    const res = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `CASH-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Blocked", ar: "محظور" },
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("POST /v1/branches as manager returns 403 forbidden_role (owner-only on create)", async () => {
    const res = await request(booted.http)
      .post("/v1/branches")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code: `MGR-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Blocked", ar: "محظور" },
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("PATCH /v1/branches/:id happy: owner updates AR name + audit", async () => {
    const res = await request(booted.http)
      .patch(`/v1/branches/${t.branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name_i18n: { en: "Main", ar: "الرئيسي ١" } });
    expect(res.status).toBe(200);
    expect(res.body.name_i18n.ar).toBe("الرئيسي ١");
    const audit = await readAuditLog(t.tenantId, "branch_updated");
    expect(audit.length).toBeGreaterThan(0);
  });

  it("PATCH /v1/branches/:id rejects currency_code change after sales (409 currency_locked_after_sales)", async () => {
    // Seed a sale at this branch so currency becomes locked.
    await adminPrisma.sale.create({
      data: {
        tenant_id: t.tenantId,
        branch_id: t.branchId,
        code: `TX-${randomUUID().slice(0, 6).toUpperCase()}`,
        cashier_id: t.userId,
        subtotal_cents: 1000n,
        total_cents: 1000n,
        currency_code: "USD",
        payment_method: "cash",
        payment_status: "paid",
        client_uuid: randomUUID(),
      },
    });
    const res = await request(booted.http)
      .patch(`/v1/branches/${t.branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ currency_code: "EUR" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("currency_locked_after_sales");
  });

  it("PATCH /v1/branches/:id as manager succeeds on own branch", async () => {
    const res = await request(booted.http)
      .patch(`/v1/branches/${managerBranchId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name_i18n: { en: "Manager Edit", ar: "تعديل المدير" } });
    expect(res.status).toBe(200);
    expect(res.body.name_i18n.en).toBe("Manager Edit");
  });

  it("PATCH /v1/branches/:id as manager rejected on other branch (400 forbidden_branch)", async () => {
    // Create a second branch directly.
    const other = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `OTHER-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Other", ar: "آخر" },
        currency_code: "USD",
      },
    });
    const res = await request(booted.http)
      .patch(`/v1/branches/${other.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name_i18n: { en: "Hijack", ar: "اختطاف" } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("forbidden_branch");
  });

  it("PATCH /v1/branches/:id with unknown id returns 404", async () => {
    const res = await request(booted.http)
      .patch(`/v1/branches/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(404);
  });

  it("DELETE /v1/branches/:id blocked when stock on hand (409 branch_has_stock)", async () => {
    // t.branchId has BranchStock rows from makeTenantWithCatalog seed.
    const res = await request(booted.http)
      .delete(`/v1/branches/${t.branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("branch_has_stock");
  });

  it("DELETE /v1/branches/:id blocked when users assigned (409 branch_has_users)", async () => {
    // Create a fresh empty branch + assign a user; then DELETE should 409.
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `USR-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Staffed", ar: "موظف" },
        currency_code: "USD",
      },
    });
    await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `staff-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Staffer",
        role: "cashier",
        locale: "en",
        branch_id: branch.id,
      },
    });
    const res = await request(booted.http)
      .delete(`/v1/branches/${branch.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("branch_has_users");
  });

  it("DELETE /v1/branches/:id happy path (no stock, no users) soft-deletes + idempotent", async () => {
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `DEL-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Deletable", ar: "للحذف" },
        currency_code: "USD",
      },
    });
    const r1 = await request(booted.http)
      .delete(`/v1/branches/${branch.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();
    const r2 = await request(booted.http)
      .delete(`/v1/branches/${branch.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(200);
    const audit = await readAuditLog(t.tenantId, "branch_deleted");
    expect(audit.some((r) => r.entity === "branch")).toBe(true);
  });

  it("DELETE /v1/branches/:id as cashier returns 403", async () => {
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `CDEL-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Cashier No", ar: "لا" },
        currency_code: "USD",
      },
    });
    const res = await request(booted.http)
      .delete(`/v1/branches/${branch.id}`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  it("DELETE /v1/branches/:id blocked during impersonation (403 forbidden_during_impersonation)", async () => {
    const branch = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `IMP-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Impersonate target", ar: "هدف" },
        currency_code: "USD",
      },
    });
    const imper = await tokens.mintImpersonationAccess({
      tenantId: t.tenantId,
      targetUserId: t.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .delete(`/v1/branches/${branch.id}`)
      .set("Authorization", `Bearer ${imper.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });
});
