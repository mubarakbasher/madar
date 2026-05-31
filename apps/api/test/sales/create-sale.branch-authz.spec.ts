import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPrisma } from "@madar/db";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenantWithCatalog,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * Branch authorization on POST /v1/sales: a non-owner may only ring sales at
 * their OWN assigned branch; owners are branch-agnostic. Guards against a
 * cashier passing a sibling branch's id to sell against a branch they aren't
 * staffed at.
 */
describe("POST /v1/sales — branch authorization", () => {
  let booted: BootedTestApp;
  let T: TenantWithCatalogFixture;
  let secondBranchId: string;
  let cashierId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    T = await makeTenantWithCatalog({ slugPrefix: "branch-authz" });

    const second = await adminPrisma.branch.create({
      data: {
        tenant_id: T.tenantId,
        code: `BR2-${randomUUID().slice(0, 6)}`,
        name_i18n: { en: "Second", ar: "الثاني" },
        currency_code: "USD",
      },
    });
    secondBranchId = second.id;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: T.tenantId,
        email: `cashier-${randomUUID().slice(0, 8)}@example.test`,
        password_hash: "unused-in-token-tests",
        name: "Pinned Cashier",
        role: "cashier",
        branch_id: T.branchId,
        locale: "en",
        is_active: true,
      },
    });
    cashierId = cashier.id;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  function tokenFor(userId: string, role: string): Promise<{ access_token: string }> {
    return booted.app
      .get(TokenService)
      .mintPair({ userId, tenantId: T.tenantId, role });
  }

  function saleBody(branchId: string) {
    return {
      branch_id: branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash",
      client_uuid: randomUUID(),
      client_sequence: 1,
      lines: [{ product_id: T.products[0]!.id, qty: 1, line_discount_cents: 0 }],
      cash_tendered_cents: 10000,
    };
  }

  it("cashier can sell at their OWN branch → 201", async () => {
    const token = (await tokenFor(cashierId, "cashier")).access_token;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(saleBody(T.branchId));
    expect(res.status).toBe(201);
  });

  it("cashier CANNOT sell at a different branch → 403 branch_not_allowed", async () => {
    const token = (await tokenFor(cashierId, "cashier")).access_token;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(saleBody(secondBranchId));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "branch_not_allowed" });
  });

  it("owner is branch-agnostic — can sell at any branch → 201", async () => {
    const token = (await tokenFor(T.userId, "owner")).access_token;
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(saleBody(secondBranchId));
    expect(res.status).toBe(201);
  });
});
