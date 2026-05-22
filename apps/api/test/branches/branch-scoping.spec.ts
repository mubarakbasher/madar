import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/products?branch_id= scoping", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let otherBranchId: string;
  let ownerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "branch-scope" });
    ownerToken = (await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })).access_token;

    // Create a second branch with different stock for the same products so the
    // sum-vs-per-branch distinction is observable.
    const other = await adminPrisma.branch.create({
      data: {
        tenant_id: t.tenantId,
        code: `OTHER-${randomUUID().slice(0, 4).toUpperCase()}`,
        name_i18n: { en: "Other", ar: "آخر" },
        currency_code: "USD",
      },
    });
    otherBranchId = other.id;
    for (const product of t.products) {
      await adminPrisma.branchStock.create({
        data: {
          tenant_id: t.tenantId,
          branch_id: other.id,
          product_id: product.id,
          qty_on_hand: 7, // distinct from t.branchId's starting_qty (10/15/20)
        },
      });
    }
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("chain-wide (no branch_id): qty_on_hand is sum across all branches", async () => {
    const res = await request(booted.http)
      .get("/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const productA = res.body.items.find((p: { id: string }) => p.id === t.products[0]!.id);
    // Branch 1 starting_qty=20 + Branch 2 qty=7 → 27
    expect(productA.qty_on_hand).toBe(20 + 7);
  });

  it("branch_id=other: qty_on_hand reflects ONLY that branch", async () => {
    const res = await request(booted.http)
      .get(`/v1/products?branch_id=${otherBranchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const productA = res.body.items.find((p: { id: string }) => p.id === t.products[0]!.id);
    expect(productA.qty_on_hand).toBe(7);
  });

  it("branch_id=main: qty_on_hand reflects ONLY that branch", async () => {
    const res = await request(booted.http)
      .get(`/v1/products?branch_id=${t.branchId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const productA = res.body.items.find((p: { id: string }) => p.id === t.products[0]!.id);
    expect(productA.qty_on_hand).toBe(20);
  });
});
