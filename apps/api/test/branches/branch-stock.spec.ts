import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/branches/:id/stock", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "branch-stock-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "branch-stock-b" });
    tokenA = (await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })).access_token;
    tokenB = (await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })).access_token;

    // Seed reorder_point on the first product so low_only has something to match.
    await adminPrisma.branchStock.updateMany({
      where: { tenant_id: tA.tenantId, branch_id: tA.branchId, product_id: tA.products[0]!.id },
      data: { qty_on_hand: 2, reorder_point: 10 },
    });
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("lists per-branch stock with sku/name + qty_on_hand", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}/stock`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    const first = res.body.items[0];
    expect(first).toHaveProperty("product_id");
    expect(first).toHaveProperty("sku");
    expect(first).toHaveProperty("qty_on_hand");
    expect(first).toHaveProperty("name_i18n");
  });

  it("low_only=true filters to rows under reorder_point", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}/stock?low_only=true`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].product_id).toBe(tA.products[0]!.id);
  });

  it("pagination: limit + page applied", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}/stock?page=1&limit=2`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    expect(res.body.limit).toBe(2);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.total).toBe("number");
  });

  it("RLS canary: tenant B sees nothing for tenant A's branch (404)", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${tA.branchId}/stock`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("404 on unknown branch id", async () => {
    const res = await request(booted.http)
      .get(`/v1/branches/${randomUUID()}/stock`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });
});
