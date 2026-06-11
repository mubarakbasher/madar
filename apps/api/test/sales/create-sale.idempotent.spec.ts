import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("POST /v1/sales — idempotency", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "sale-idem" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  function buildBody(clientUuid: string) {
    return {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash" as const,
      client_uuid: clientUuid,
      client_sequence: 1,
      lines: [{ product_id: t.products[0]!.id, qty: 1, line_discount_cents: 0, note: null }],
      cash_tendered_cents: 5000,
    };
  }

  it("Idempotency-Key replay returns the SAME sale; no duplicate rows", async () => {
    const idemKey = randomUUID();
    const body = buildBody(randomUUID());

    const r1 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send(body);
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
    expect(r2.body.code).toBe(r1.body.code);

    const rows = await adminPrisma.sale.findMany({
      where: { tenant_id: t.tenantId, client_uuid: body.client_uuid },
    });
    expect(rows).toHaveLength(1);
  });

  it("same client_uuid with DIFFERENT Idempotency-Key still dedupes to one sale", async () => {
    const clientUuid = randomUUID();
    const body = buildBody(clientUuid);

    const r1 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID()) // different idempotency key
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);

    const rows = await adminPrisma.sale.findMany({
      where: { tenant_id: t.tenantId, client_uuid: clientUuid },
    });
    expect(rows).toHaveLength(1);
  });

  it("different client_uuid creates a new sale", async () => {
    const r1 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(buildBody(randomUUID()));
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(buildBody(randomUUID()));
    expect(r2.status).toBe(201);
    expect(r2.body.id).not.toBe(r1.body.id);
    expect(r2.body.code).not.toBe(r1.body.code);
  });

  it("missing Idempotency-Key returns 400", async () => {
    const res = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildBody(randomUUID()));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "idempotency_key_required" });
  });

  it("same key with a DIFFERENT body returns 422 idempotency_payload_mismatch", async () => {
    const idemKey = randomUUID();
    const r1 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send(buildBody(randomUUID()));
    expect(r1.status).toBe(201);

    const r2 = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", idemKey)
      .send(buildBody(randomUUID())); // different client_uuid → different payload
    expect(r2.status).toBe(422);
    expect(r2.body).toMatchObject({ code: "idempotency_payload_mismatch" });
  });

  it("another tenant replaying the same Idempotency-Key never receives the first tenant's cached response", async () => {
    const { makeTenantWithCatalog } = await import("../helpers/fixtures");
    const other = await makeTenantWithCatalog({ slugPrefix: "sale-idem-b" });
    const otherToken = (
      await booted.app
        .get(TokenService)
        .mintPair({ userId: other.userId, tenantId: other.tenantId, role: "owner" })
    ).access_token;

    const sharedKey = randomUUID();

    const a = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", sharedKey)
      .send(buildBody(randomUUID()));
    expect(a.status).toBe(201);

    // Same route, same UUID key, different tenant: must execute B's own
    // request (its own branch/product), not replay A's cached sale.
    const b = await request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("Idempotency-Key", sharedKey)
      .send({
        branch_id: other.branchId,
        customer_id: null,
        currency_code: "USD",
        payment_method: "cash" as const,
        client_uuid: randomUUID(),
        client_sequence: 1,
        lines: [
          { product_id: other.products[0]!.id, qty: 1, line_discount_cents: 0, note: null },
        ],
        cash_tendered_cents: 5000,
      });
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);

    const bRow = await adminPrisma.sale.findUnique({ where: { id: b.body.id } });
    expect(bRow!.tenant_id).toBe(other.tenantId);
  });
});
