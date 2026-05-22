import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("Stock-transfer RLS + role + manager-branch scoping + impersonation", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let tokenA: string;
  let tokenB: string;
  let secondBranchA: string;
  let managerOnBranchAToken: string;
  let managerOnSecondBranchToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "xfer-rls-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "xfer-rls-b" });
    tokenA = (await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })).access_token;
    tokenB = (await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })).access_token;

    const second = await adminPrisma.branch.create({
      data: {
        tenant_id: tA.tenantId,
        code: `B2-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Second", ar: "الثاني" },
        currency_code: "USD",
      },
    });
    secondBranchA = second.id;

    const mgrA = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-a-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Mgr A",
        role: "manager",
        locale: "en",
        branch_id: tA.branchId,
      },
    });
    managerOnBranchAToken = (await tokens.mintPair({ userId: mgrA.id, tenantId: tA.tenantId, role: "manager" })).access_token;
    const mgrSecond = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-second-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Mgr Second",
        role: "manager",
        locale: "en",
        branch_id: secondBranchA,
      },
    });
    managerOnSecondBranchToken = (await tokens.mintPair({ userId: mgrSecond.id, tenantId: tA.tenantId, role: "manager" })).access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("RLS canary: tenant B does not see tenant A's transfers", async () => {
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    const id = create.body.id as string;
    const list = await request(booted.http)
      .get("/v1/stock-transfers")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(list.body.items.every((r: { id: string }) => r.id !== id)).toBe(true);
    const detail = await request(booted.http)
      .get(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(detail.status).toBe(404);
  });

  it("Manager can act when their branch is sender OR receiver", async () => {
    // Manager on branchA (sender role) can create when from_branch = their branch.
    const r1 = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${managerOnBranchAToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    expect(r1.status).toBe(201);

    // Manager on secondBranch (receiver role) can also create with their branch as receiver.
    const r2 = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${managerOnSecondBranchToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    expect(r2.status).toBe(201);
  });

  it("Manager NOT involved with either branch is 400 forbidden_branch", async () => {
    const thirdBranch = await adminPrisma.branch.create({
      data: {
        tenant_id: tA.tenantId,
        code: `B3-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Third", ar: "الثالث" },
        currency_code: "USD",
      },
    });
    const mgrThird = await adminPrisma.user.create({
      data: {
        tenant_id: tA.tenantId,
        email: `mgr-third-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Mgr Third",
        role: "manager",
        locale: "en",
        branch_id: thirdBranch.id,
      },
    });
    const token = (await tokens.mintPair({ userId: mgrThird.id, tenantId: tA.tenantId, role: "manager" })).access_token;
    const res = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("forbidden_branch");
  });

  it("Manager at sender branch is the only one who can /send (receiver-branch manager 403)", async () => {
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    const id = create.body.id as string;
    const blocked = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${managerOnSecondBranchToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("forbidden_branch");

    const ok = await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${managerOnBranchAToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("in_transit");
  });

  it("DELETE blocked during impersonation (403 forbidden_during_impersonation)", async () => {
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    const id = create.body.id as string;
    const imper = await tokens.mintImpersonationAccess({
      tenantId: tA.tenantId,
      targetUserId: tA.userId,
      targetRole: "owner",
      impersonatorId: randomUUID(),
      impersonatorEmail: "admin@platform.test",
    });
    const res = await request(booted.http)
      .delete(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${imper.access_token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_during_impersonation");
  });

  it("DELETE blocked once status leaves draft/cancelled (409 transfer_not_deletable)", async () => {
    const create = await request(booted.http)
      .post("/v1/stock-transfers")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        from_branch_id: tA.branchId,
        to_branch_id: secondBranchA,
        lines: [{ product_id: tA.products[0]!.id, qty_sent: 1 }],
      });
    const id = create.body.id as string;
    await request(booted.http)
      .post(`/v1/stock-transfers/${id}/send`)
      .set("Authorization", `Bearer ${tokenA}`);
    const res = await request(booted.http)
      .delete(`/v1/stock-transfers/${id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("transfer_not_deletable");
  });
});
