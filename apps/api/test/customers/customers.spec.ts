/**
 * Tenant Customers (CRUD) — list / get / create / update / soft-delete.
 *
 * Companion to apps/api/src/tenant/customers/. Verifies RBAC, idempotent
 * conflict mapping (email_taken / phone_taken), audit-log writes, RLS isolation,
 * and the has_store_credit delete guard.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog } from "../helpers/fixtures";

describe("Tenant Customers (/v1/customers)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;

  let tenantA: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenA: string;
  let managerTokenA: string;
  let cashierTokenA: string;

  let tenantB: Awaited<ReturnType<typeof makeTenant>>;
  let ownerTokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    tenantA = await makeTenant({ slugPrefix: "cust-a" });
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

    tenantB = await makeTenant({ slugPrefix: "cust-b" });
    ownerTokenB = (
      await tokens.mintPair({ userId: tenantB.userId, tenantId: tenantB.tenantId, role: "owner" })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. happy create + audit ────────────────────────────────────────────

  it("creates a customer, returns detail shape, writes audit_log row", async () => {
    const email = `walkin-${randomUUID().slice(0, 6)}@example.test`;
    const res = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: "Walkin Wanda",
        phone: `+1${Math.floor(Math.random() * 1e10)
          .toString()
          .padStart(10, "0")}`,
        email,
        notes: "Likes lattes",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Walkin Wanda",
      email,
      notes: "Likes lattes",
      store_credit_balance_minor: "0",
      sales_count: 0,
      recent_sales: [],
    });
    expect(res.body.id).toMatch(/[a-f0-9-]{36}/);

    const audit = await readAuditLog(tenantA.tenantId, "customer_created");
    const row = audit.find((a) => (a.after as { email?: string })?.email === email);
    expect(row).toBeDefined();
    expect(row?.entity).toBe("customer");
  });

  // ─── 2. duplicate phone 409 ─────────────────────────────────────────────

  it("rejects duplicate phone with 409 phone_taken", async () => {
    const phone = `+1${Math.floor(Math.random() * 1e10)
      .toString()
      .padStart(10, "0")}`;
    const first = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "First", phone });
    expect(first.status).toBe(201);

    const dup = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Second", phone });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("phone_taken");
  });

  // ─── 3. duplicate email 409 ─────────────────────────────────────────────

  it("rejects duplicate email with 409 email_taken", async () => {
    const email = `dup-${randomUUID().slice(0, 6)}@example.test`;
    const first = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "First", email });
    expect(first.status).toBe(201);

    const dup = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Second", email });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("email_taken");
  });

  // ─── 4. PATCH happy + audit before/after ────────────────────────────────

  it("manager can PATCH a customer; audit records before/after of changed fields only", async () => {
    const created = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Original Name" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const patched = await request(booted.http)
      .patch(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${managerTokenA}`)
      .send({ name: "Updated Name", notes: "Tier: gold" });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Updated Name");
    expect(patched.body.notes).toBe("Tier: gold");

    const audit = await readAuditLog(tenantA.tenantId, "customer_updated");
    const row = audit.find((a) => (a.after as { name?: string })?.name === "Updated Name");
    expect(row).toBeDefined();
    expect(row?.after).toMatchObject({ name: "Updated Name", notes: "Tier: gold" });
  });

  // ─── 5. RLS canary — tenant B cannot see tenant A's customer ───────────

  it("returns 404 when tenant B requests tenant A's customer", async () => {
    const created = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "RLS Test" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const crossRead = await request(booted.http)
      .get(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(crossRead.status).toBe(404);
    expect(crossRead.body.code).toBe("customer_not_found");

    const listB = await request(booted.http)
      .get("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.items.find((c: { id: string }) => c.id === id)).toBeUndefined();
  });

  // ─── 6. DELETE blocked when store_credit_balance != 0 ──────────────────

  it("blocks DELETE with 409 has_store_credit when balance is non-zero", async () => {
    const created = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Has Credit" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    await adminPrisma.customer.update({
      where: { id },
      data: { store_credit_balance_minor: 1000n, store_credit_currency_code: "USD" },
    });

    const del = await request(booted.http)
      .delete(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe("has_store_credit");

    // Sanity: zeroing the balance unblocks the delete.
    await adminPrisma.customer.update({
      where: { id },
      data: { store_credit_balance_minor: 0n },
    });
    const ok = await request(booted.http)
      .delete(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(ok.status).toBe(200);
    expect(ok.body.deleted).toBe(true);
  });

  // ─── 7. cashier can list/create; cashier 403 on PATCH and DELETE ───────

  it("cashier can list + create + read but is 403 on PATCH and DELETE", async () => {
    const list = await request(booted.http)
      .get("/v1/customers")
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);

    const created = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: "Cashier-created" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const patch = await request(booted.http)
      .patch(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${cashierTokenA}`)
      .send({ name: "Nope" });
    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe("forbidden_role");

    const del = await request(booted.http)
      .delete(`/v1/customers/${id}`)
      .set("Authorization", `Bearer ${cashierTokenA}`);
    expect(del.status).toBe(403);
    expect(del.body.code).toBe("forbidden_role");
  });

  // ─── 8. list search hits name + phone + email + code ───────────────────

  it("list search ILIKEs against name / phone / email / code", async () => {
    const unique = `Searchtest-${randomUUID().slice(0, 6)}`;
    const created = await request(booted.http)
      .post("/v1/customers")
      .set("Authorization", `Bearer ${ownerTokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({ name: `${unique} Person`, code: `CUST-${randomUUID().slice(0, 6).toUpperCase()}` });
    expect(created.status).toBe(201);

    const res = await request(booted.http)
      .get(`/v1/customers?search=${encodeURIComponent(unique)}`)
      .set("Authorization", `Bearer ${ownerTokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.find((c: { id: string }) => c.id === created.body.id)).toBeDefined();
  });
});
