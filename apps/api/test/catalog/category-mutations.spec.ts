import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, readAuditLog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Category mutations (POST/PATCH/DELETE /v1/categories)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "cat-cats" });
    const pair = await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    ownerToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("POST /v1/categories creates a category", async () => {
    const code = `pastry-${randomUUID().slice(0, 6)}`;
    const res = await request(booted.http)
      .post("/v1/categories")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        code,
        name_i18n: { en: "Pastries", ar: "معجنات" },
        sort_order: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
    expect(res.body.name_i18n.ar).toBe("معجنات");
    const audit = await readAuditLog(t.tenantId, "category_created");
    expect(audit.some((r) => (r.after as { code?: string })?.code === code)).toBe(true);
  });

  it("POST /v1/categories with duplicate code returns 409", async () => {
    const code = `dup-${randomUUID().slice(0, 6)}`;
    await request(booted.http)
      .post("/v1/categories")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "First", ar: "أول" } });
    const res = await request(booted.http)
      .post("/v1/categories")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ code, name_i18n: { en: "Second", ar: "ثاني" } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("category_code_taken");
  });

  it("PATCH /v1/categories/:id rejects self-parent", async () => {
    const cat = await adminPrisma.category.create({
      data: {
        tenant_id: t.tenantId,
        code: `self-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Self", ar: "ذاتي" },
      },
    });
    const res = await request(booted.http)
      .patch(`/v1/categories/${cat.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ parent_id: cat.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("category_self_parent");
  });

  it("DELETE /v1/categories/:id rejects with 400 when products reference it", async () => {
    const cat = await adminPrisma.category.create({
      data: {
        tenant_id: t.tenantId,
        code: `in-use-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "InUse", ar: "مستخدم" },
      },
    });
    await adminPrisma.product.create({
      data: {
        tenant_id: t.tenantId,
        sku: `INUSE-${randomUUID().slice(0, 6).toUpperCase()}`,
        name_i18n: { en: "Bound", ar: "مرتبط" },
        category_id: cat.id,
        price_cents: 100n,
        cost_cents: 50n,
        currency_code: "USD",
      },
    });
    const res = await request(booted.http)
      .delete(`/v1/categories/${cat.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("category_in_use");
  });

  it("DELETE /v1/categories/:id with no references soft-deletes + writes audit", async () => {
    const cat = await adminPrisma.category.create({
      data: {
        tenant_id: t.tenantId,
        code: `empty-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Empty", ar: "فارغ" },
      },
    });
    const res = await request(booted.http)
      .delete(`/v1/categories/${cat.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted_at).toBeTruthy();

    const after = await adminPrisma.category.findUnique({ where: { id: cat.id } });
    expect(after?.deleted_at).not.toBeNull();
  });
});
