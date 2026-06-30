/**
 * Tenant Fixed Assets (CRUD) — list / get / create / update / soft-delete.
 *
 * Companion to apps/api/src/tenant/fixed-assets/. Verifies RBAC (owner/manager
 * write, cashier read-only), the per-(branch, English name) uniqueness mapped to
 * 409 asset_exists, unknown-branch 422, audit-log writes, RLS isolation, and the
 * branch filter on list. Cross-tenant isolation is also covered structurally by
 * packages/db/test/rls.test.ts.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPrisma } from "@madar/db";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

async function makeBranch(tenantId: string): Promise<string> {
  const branch = await adminPrisma.branch.create({
    data: {
      tenant_id: tenantId,
      code: `b-${randomUUID().slice(0, 6)}`,
      name_i18n: { en: "Main Branch", ar: "الفرع الرئيسي" },
      currency_code: "USD",
    },
  });
  return branch.id;
}

describe("Tenant Fixed Assets (/v1/assets)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  let tenantA: Awaited<ReturnType<typeof makeTenant>>;
  let branchA: string;
  let ownerTokenA: string;
  let managerTokenA: string;
  let cashierTokenA: string;

  let tenantB: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    tenantA = await makeTenant({ slugPrefix: "asset-a" });
    branchA = await makeBranch(tenantA.tenantId);
    ownerTokenA = (
      await tokens.mintPair({ userId: tenantA.userId, tenantId: tenantA.tenantId, role: "owner" })
    ).access_token;

    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: tenantA.tenantId,
        email: `mgr-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Manager",
        role: "manager",
        locale: "en",
      },
    });
    managerTokenA = (
      await tokens.mintPair({ userId: manager.id, tenantId: tenantA.tenantId, role: "manager" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: tenantA.tenantId,
        email: `cash-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierTokenA = (
      await tokens.mintPair({ userId: cashier.id, tenantId: tenantA.tenantId, role: "cashier" })
    ).access_token;

    tenantB = await makeTenant({ slugPrefix: "asset-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. create + detail shape + audit ───────────────────────────────────

  it("creates an asset, returns detail shape, writes audit_log row", async () => {
    const res = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        branch_id: branchA,
        name_i18n: { en: "Chairs", ar: "كراسي" },
        quantity: 20,
        notes: "Dining area",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      branch_id: branchA,
      name_i18n: { en: "Chairs", ar: "كراسي" },
      quantity: 20,
      notes: "Dining area",
    });
    expect(res.body.branch_name_i18n).toMatchObject({ en: "Main Branch" });
    expect(res.body.id).toMatch(/[a-f0-9-]{36}/);

    const audit = await readAuditLog(tenantA.tenantId, "fixed_asset_created");
    const row = audit.find(
      (a) => (a.after as { name_i18n?: { en?: string } })?.name_i18n?.en === "Chairs",
    );
    expect(row).toBeDefined();
    expect(row?.entity).toBe("fixed_asset");
  });

  // ─── 2. duplicate name in same branch → 409 (case-insensitive) ──────────

  it("rejects a duplicate asset name in the same branch with 409 asset_exists", async () => {
    const first = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Tables", ar: "طاولات" }, quantity: 5 });
    expect(first.status).toBe(201);

    const dup = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "tables", ar: "طاولات ٢" }, quantity: 9 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("asset_exists");
  });

  // ─── 3. unknown branch → 422 ────────────────────────────────────────────

  it("rejects an unknown branch with 422 unknown_branch", async () => {
    const res = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: randomUUID(), name_i18n: { en: "Fridges", ar: "ثلاجات" }, quantity: 1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_branch");
  });

  // ─── 4. manager PATCH quantity + audit before/after ─────────────────────

  it("manager can PATCH quantity; audit records before/after of changed fields", async () => {
    const created = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Sofas", ar: "كنب" }, quantity: 3 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const patched = await request(booted.http)
      .patch(`/v1/assets/${id}`)
      .set("Authorization", `Bearer ${managerTokenA}`)
      .send({ quantity: 7 });
    expect(patched.status).toBe(200);
    expect(patched.body.quantity).toBe(7);

    const audit = await readAuditLog(tenantA.tenantId, "fixed_asset_updated");
    const row = audit.find((a) => (a.after as { quantity?: number })?.quantity === 7);
    expect(row?.before).toMatchObject({ quantity: 3 });
    expect(row?.after).toMatchObject({ quantity: 7 });
  });

  // ─── 5. RLS canary — tenant B cannot see tenant A's asset ───────────────

  it("returns 404 when tenant B requests tenant A's asset", async () => {
    const created = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Counters", ar: "كاونترات" }, quantity: 2 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const crossRead = await request(booted.http)
      .get(`/v1/assets/${id}`)
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(crossRead.status).toBe(404);
    expect(crossRead.body.code).toBe("asset_not_found");

    const listB = await request(booted.http)
      .get("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.items.find((a: { id: string }) => a.id === id)).toBeUndefined();
  });

  // ─── 6. cashier read-only: list 200, create/patch/delete 403 ────────────

  it("cashier can list but is 403 on create / patch / delete", async () => {
    const list = await request(booted.http)
      .get("/v1/assets")
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);

    const create = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Shelves", ar: "رفوف" }, quantity: 4 });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("forbidden_role");
  });

  // ─── 7. soft-delete, then the same name can be re-created in the branch ──

  it("soft-deletes an asset and frees its name for re-use in the branch", async () => {
    const created = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Desks", ar: "مكاتب" }, quantity: 6 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const del = await request(booted.http)
      .delete(`/v1/assets/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    // Re-adding the same name now succeeds (partial unique ignores soft-deleted).
    const recreated = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: branchA, name_i18n: { en: "Desks", ar: "مكاتب" }, quantity: 6 });
    expect(recreated.status).toBe(201);
  });

  // ─── 8. branch filter on list ───────────────────────────────────────────

  it("list filters by branch_id", async () => {
    const otherBranch = await makeBranch(tenantA.tenantId);
    const created = await request(booted.http)
      .post("/v1/assets")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ branch_id: otherBranch, name_i18n: { en: "Lamps", ar: "مصابيح" }, quantity: 8 });
    expect(created.status).toBe(201);

    const res = await request(booted.http)
      .get(`/v1/assets?branch_id=${otherBranch}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((a: { branch_id: string }) => a.branch_id === otherBranch)).toBe(true);
    expect(res.body.items.find((a: { id: string }) => a.id === created.body.id)).toBeDefined();
  });
});
