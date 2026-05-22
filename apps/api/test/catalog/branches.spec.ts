import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("GET /v1/branches", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let tA: TenantWithCatalogFixture;
  let tB: TenantWithCatalogFixture;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    tA = await makeTenantWithCatalog({ slugPrefix: "branches-a" });
    tB = await makeTenantWithCatalog({ slugPrefix: "branches-b" });
    tokenA = (await tokens.mintPair({ userId: tA.userId, tenantId: tA.tenantId, role: "owner" })).access_token;
    tokenB = (await tokens.mintPair({ userId: tB.userId, tenantId: tB.tenantId, role: "owner" })).access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  it("returns only the calling tenant's branches", async () => {
    const res = await request(booted.http)
      .get("/v1/branches")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(tA.branchId);
  });

  it("RLS canary — tenant B does not see tenant A's branches", async () => {
    const res = await request(booted.http)
      .get("/v1/branches")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((b: { id: string }) => b.id !== tA.branchId)).toBe(true);
  });

  it("401 without token", async () => {
    const res = await request(booted.http).get("/v1/branches");
    expect(res.status).toBe(401);
  });
});
