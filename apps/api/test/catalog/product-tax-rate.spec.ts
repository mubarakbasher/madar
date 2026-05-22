/**
 * tax_rate_pct projection on /v1/products + /v1/products/:id, and the new
 * TenantDto fields default_tax_class_id + tax_inclusive_default surfaced
 * through /v1/auth/me. Companion to the cart-tax preview slice (A2).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("tax_rate_pct projection + TenantDto tax fields (A2)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let accessToken: string;
  let standardClassId: string;
  let zeroClassId: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "tax-rate-test" });
    accessToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const standard = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: `STD-${randomUUID().slice(0, 6).toUpperCase()}`,
        name_i18n: { en: "Standard 14%", ar: "قياسي ١٤٪" },
        rate_bps: 1400,
        is_active: true,
      },
    });
    standardClassId = standard.id;

    const zero = await adminPrisma.taxClass.create({
      data: {
        tenant_id: t.tenantId,
        code: `ZERO-${randomUUID().slice(0, 6).toUpperCase()}`,
        name_i18n: { en: "Zero-rated", ar: "بدون ضريبة" },
        rate_bps: 0,
        is_active: true,
      },
    });
    zeroClassId = zero.id;

    // Tenant default = standard; tax_inclusive_default = true.
    await adminPrisma.tenant.update({
      where: { id: t.tenantId },
      data: { default_tax_class_id: standardClassId, tax_inclusive_default: true },
    });

    // Override product[1]'s tax_class_id to zero — so it should resolve to 0%
    // while the other products inherit the tenant default (14%).
    await adminPrisma.product.update({
      where: { id: t.products[1]!.id },
      data: { tax_class_id: zeroClassId },
    });
  });

  afterAll(async () => {
    await booted.app.close();
  });

  // ─── 1. listProducts projects tax_rate_pct correctly ────────────────────

  it("list returns 14 for tenant-default products, 0 for the overridden one", async () => {
    const res = await request(booted.http)
      .get("/v1/products")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    const overridden = res.body.items.find(
      (p: { id: string }) => p.id === t.products[1]!.id,
    );
    const inherited = res.body.items.find(
      (p: { id: string }) => p.id === t.products[0]!.id,
    );

    expect(overridden.tax_class_id).toBe(zeroClassId);
    expect(overridden.tax_rate_pct).toBe(0);
    expect(inherited.tax_class_id).toBeNull();
    expect(inherited.tax_rate_pct).toBe(14);
  });

  // ─── 2. TenantDto exposes default_tax_class_id + tax_inclusive_default ──

  it("/v1/auth/me returns the new tenant tax fields", async () => {
    const res = await request(booted.http)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tenant.default_tax_class_id).toBe(standardClassId);
    expect(res.body.tenant.tax_inclusive_default).toBe(true);
  });
});
