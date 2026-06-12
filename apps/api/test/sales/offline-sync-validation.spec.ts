/**
 * Offline sync validation (ADR 0005, audit M-14):
 *  - offline sales price at the client's snapshot; catalog drift → ONE
 *    price_drift conflict with per-line details;
 *  - online sales ignore client price snapshots entirely;
 *  - per-device client_sequence must be monotonic and gap-free — gaps and
 *    out-of-order arrivals record sequence_gap conflicts (sale completes);
 *  - offline sales referencing unknown products 422 AND leave a
 *    product_unknown conflict for the manager.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenantWithCatalog, type TenantWithCatalogFixture } from "../helpers/fixtures";

describe("POST /v1/sales — offline sync validation (ADR 0005)", () => {
  let booted: BootedTestApp;
  let t: TenantWithCatalogFixture;
  let accessToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    t = await makeTenantWithCatalog({ slugPrefix: "offline-val" });
    const pair = await booted.app
      .get(TokenService)
      .mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" });
    accessToken = pair.access_token;
  });
  afterAll(async () => {
    await booted.app.close();
  });

  function post(body: Record<string, unknown>) {
    return request(booted.http)
      .post("/v1/sales")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  function offlineBody(overrides: Record<string, unknown> = {}) {
    const p = t.products[0]!;
    return {
      branch_id: t.branchId,
      customer_id: null,
      currency_code: "USD",
      payment_method: "cash" as const,
      client_uuid: randomUUID(),
      client_sequence: 1,
      device_id: randomUUID(),
      offline_completed: true,
      lines: [{ product_id: p.id, qty: 1, line_discount_cents: 0, note: null }],
      cash_tendered_cents: Number(p.price_cents),
      ...overrides,
    };
  }

  // ─── price drift ───────────────────────────────────────────────────────

  it("offline sale at a stale price completes AT THAT PRICE and records price_drift", async () => {
    const p = t.products[0]!;
    const stale = p.price_cents - 500n; // catalog moved since the till cached it
    const res = await post(
      offlineBody({
        lines: [
          {
            product_id: p.id,
            qty: 2,
            line_discount_cents: 0,
            note: null,
            unit_price_cents: stale.toString(),
          },
        ],
        cash_tendered_cents: Number(stale * 2n),
      }),
    );
    expect(res.status).toBe(201);
    // Money reality: the sale records what the customer actually paid.
    expect(res.body.total_cents).toBe((stale * 2n).toString());

    const conflicts = await adminPrisma.syncConflict.findMany({
      where: { tenant_id: t.tenantId, conflict_kind: "price_drift", reference_id: res.body.id },
    });
    expect(conflicts).toHaveLength(1);
    const details = conflicts[0]!.details as {
      lines: Array<{ product_id: string; client_price_cents: string; catalog_price_cents: string }>;
    };
    expect(details.lines).toHaveLength(1);
    expect(details.lines[0]!.client_price_cents).toBe(stale.toString());
    expect(details.lines[0]!.catalog_price_cents).toBe(p.price_cents.toString());
  });

  it("matching client price produces NO conflict", async () => {
    const p = t.products[0]!;
    const res = await post(
      offlineBody({
        lines: [
          {
            product_id: p.id,
            qty: 1,
            line_discount_cents: 0,
            note: null,
            unit_price_cents: p.price_cents.toString(),
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const conflicts = await adminPrisma.syncConflict.findMany({
      where: { tenant_id: t.tenantId, conflict_kind: "price_drift", reference_id: res.body.id },
    });
    expect(conflicts).toHaveLength(0);
  });

  it("ONLINE sales ignore the client price snapshot (server prices from catalog)", async () => {
    const p = t.products[0]!;
    const res = await post(
      offlineBody({
        offline_completed: false,
        device_id: null,
        client_sequence: null,
        lines: [
          {
            product_id: p.id,
            qty: 1,
            line_discount_cents: 0,
            note: null,
            unit_price_cents: "1", // absurd — must be ignored
          },
        ],
        cash_tendered_cents: Number(p.price_cents),
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe(p.price_cents.toString());
  });

  // ─── sequence validation ───────────────────────────────────────────────

  it("per-device sequence: in-order is silent, a gap and an out-of-order arrival each record sequence_gap", async () => {
    const device = randomUUID();

    const s1 = await post(offlineBody({ device_id: device, client_sequence: 1 }));
    expect(s1.status).toBe(201);

    // seq 3 after 1 → gap (seq 2 may be lost in the device queue).
    const s3 = await post(offlineBody({ device_id: device, client_sequence: 3 }));
    expect(s3.status).toBe(201);

    // seq 2 after 3 → out_of_order.
    const s2 = await post(offlineBody({ device_id: device, client_sequence: 2 }));
    expect(s2.status).toBe(201);

    const conflicts = await adminPrisma.syncConflict.findMany({
      where: { tenant_id: t.tenantId, conflict_kind: "sequence_gap" },
      orderBy: { created_at: "asc" },
    });
    const forDevice = conflicts.filter(
      (c) => (c.details as { device_id?: string }).device_id === device,
    );
    expect(forDevice).toHaveLength(2);
    expect((forDevice[0]!.details as { kind: string }).kind).toBe("gap");
    expect((forDevice[0]!.details as { received_sequence: number }).received_sequence).toBe(3);
    expect((forDevice[1]!.details as { kind: string }).kind).toBe("out_of_order");
  });

  it("online sales never trigger sequence validation", async () => {
    const device = randomUUID();
    const res = await post(
      offlineBody({
        offline_completed: false,
        device_id: device,
        client_sequence: 7, // would be a gap if validated
      }),
    );
    expect(res.status).toBe(201);
    const conflicts = await adminPrisma.syncConflict.findMany({
      where: { tenant_id: t.tenantId, conflict_kind: "sequence_gap" },
    });
    expect(
      conflicts.filter((c) => (c.details as { device_id?: string }).device_id === device),
    ).toHaveLength(0);
  });

  // ─── product_unknown ───────────────────────────────────────────────────

  it("offline sale with a since-deleted product 422s AND records product_unknown", async () => {
    const ghost = randomUUID();
    const clientUuid = randomUUID();
    const res = await post(
      offlineBody({
        client_uuid: clientUuid,
        lines: [{ product_id: ghost, qty: 1, line_discount_cents: 0, note: null }],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unknown_product");

    const conflicts = await adminPrisma.syncConflict.findMany({
      where: {
        tenant_id: t.tenantId,
        conflict_kind: "product_unknown",
        reference_id: clientUuid,
      },
    });
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0]!.details as { product_id: string }).product_id).toBe(ghost);
  });

  it("ONLINE sale with an unknown product 422s WITHOUT a conflict row", async () => {
    const ghost = randomUUID();
    const clientUuid = randomUUID();
    const res = await post(
      offlineBody({
        offline_completed: false,
        client_uuid: clientUuid,
        lines: [{ product_id: ghost, qty: 1, line_discount_cents: 0, note: null }],
      }),
    );
    expect(res.status).toBe(422);
    const conflicts = await adminPrisma.syncConflict.findMany({
      where: { tenant_id: t.tenantId, conflict_kind: "product_unknown", reference_id: clientUuid },
    });
    expect(conflicts).toHaveLength(0);
  });
});
