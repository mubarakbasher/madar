import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import { makeTenant, readAuditLog, type TenantFixture } from "../helpers/fixtures";

async function makeCustomer(tenantId: string, opts?: { name?: string }): Promise<string> {
  const c = await adminPrisma.customer.create({
    data: {
      tenant_id: tenantId,
      name: opts?.name ?? `Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  return c.id;
}

async function readLedgerRows(
  tenantId: string,
  customerId: string,
): Promise<
  Array<{
    id: string;
    amount_minor: bigint;
    balance_after_minor: bigint;
    currency_code: string;
    reference_table: string;
    reference_id: string | null;
    created_by: string | null;
  }>
> {
  return adminPrisma.storeCreditLedger.findMany({
    where: { tenant_id: tenantId, customer_id: customerId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      amount_minor: true,
      balance_after_minor: true,
      currency_code: true,
      reference_table: true,
      reference_id: true,
      created_by: true,
    },
  });
}

describe("Store credit (/v1/customers/:id/store-credit)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantFixture;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let accountantToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);

    t = await makeTenant({ slugPrefix: "sc-main" });
    ownerToken = (
      await tokens.mintPair({ userId: t.userId, tenantId: t.tenantId, role: "owner" })
    ).access_token;

    const manager = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `mgr-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Manager",
        role: "manager",
        locale: "en",
      },
    });
    managerToken = (
      await tokens.mintPair({ userId: manager.id, tenantId: t.tenantId, role: "manager" })
    ).access_token;

    const cashier = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `cashier-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Cashier",
        role: "cashier",
        locale: "en",
      },
    });
    cashierToken = (
      await tokens.mintPair({ userId: cashier.id, tenantId: t.tenantId, role: "cashier" })
    ).access_token;

    const accountant = await adminPrisma.user.create({
      data: {
        tenant_id: t.tenantId,
        email: `acct-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Accountant",
        role: "accountant",
        locale: "en",
      },
    });
    accountantToken = (
      await tokens.mintPair({
        userId: accountant.id,
        tenantId: t.tenantId,
        role: "accountant",
      })
    ).access_token;

    otherTenant = await makeTenant({ slugPrefix: "sc-other" });
    otherOwnerToken = (
      await tokens.mintPair({
        userId: otherTenant.userId,
        tenantId: otherTenant.tenantId,
        role: "owner",
      })
    ).access_token;
  });

  afterAll(async () => {
    await booted.app.close();
  });

  it("POST 403: cashier cannot adjust", async () => {
    const customerId = await makeCustomer(t.tenantId);
    const res = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "5000",
        currency_code: "USD",
        note_i18n: { en: "no-op", ar: "لا شيء" },
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden_role");
  });

  it("POST happy: positive adjust increases balance and writes ledger row", async () => {
    const customerId = await makeCustomer(t.tenantId);

    const res = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "5000",
        currency_code: "USD",
        note_i18n: { en: "Goodwill credit", ar: "رصيد ودي" },
      });
    expect(res.status).toBe(200);
    expect(res.body.balance_minor).toBe("5000");
    expect(res.body.currency_code).toBe("USD");
    expect(res.body.ledger).toHaveLength(1);
    expect(res.body.ledger[0].reference_table).toBe("manual_adjust");

    const rows = await readLedgerRows(t.tenantId, customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount_minor).toBe(5000n);
    expect(rows[0]!.balance_after_minor).toBe(5000n);
    expect(rows[0]!.reference_table).toBe("manual_adjust");
    expect(rows[0]!.created_by).toBe(t.userId);
  });

  it("POST 400 insufficient_balance: cannot debit into negative", async () => {
    const customerId = await makeCustomer(t.tenantId);

    // Add 1000, then attempt to subtract 2000.
    const credit = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "1000",
        currency_code: "USD",
        note_i18n: { en: "Seed", ar: "بذرة" },
      });
    expect(credit.status).toBe(200);

    const debit = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "-2000",
        currency_code: "USD",
        note_i18n: { en: "Bad debit", ar: "خصم سيئ" },
      });
    expect(debit.status).toBe(400);
    expect(debit.body.code).toBe("insufficient_balance");

    // Ledger should still have only the seed row; no debit row inserted.
    const rows = await readLedgerRows(t.tenantId, customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount_minor).toBe(1000n);
  });

  it("POST 400 currency_mismatch: subsequent adjusts must match locked currency", async () => {
    const customerId = await makeCustomer(t.tenantId);

    const seed = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "1000",
        currency_code: "USD",
        note_i18n: { en: "Seed USD", ar: "بذرة دولار" },
      });
    expect(seed.status).toBe(200);

    const mismatch = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "500",
        currency_code: "EUR",
        note_i18n: { en: "Bad EUR", ar: "يورو سيء" },
      });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe("currency_mismatch");
  });

  it("RLS canary: tenant B cannot read or adjust tenant A's customer credit", async () => {
    const customerId = await makeCustomer(t.tenantId);
    await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "1234",
        currency_code: "USD",
        note_i18n: { en: "Tenant A only", ar: "المستأجر أ فقط" },
      });

    const peek = await request(booted.http)
      .get(`/v1/customers/${customerId}/store-credit`)
      .set("Authorization", `Bearer ${otherOwnerToken}`);
    expect(peek.status).toBe(404);

    const peekAdjust = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${otherOwnerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "9999",
        currency_code: "USD",
        note_i18n: { en: "hack", ar: "اختراق" },
      });
    expect(peekAdjust.status).toBe(404);
  });

  it("Concurrent double-spend prevented by FOR UPDATE lock", async () => {
    const customerId = await makeCustomer(t.tenantId);

    // Seed with 1000.
    await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "1000",
        currency_code: "USD",
        note_i18n: { en: "Seed", ar: "بذرة" },
      });

    // Two parallel debits of -800 each — only one should succeed because the
    // second one would put the balance negative (200 - 800 = -600).
    const [r1, r2] = await Promise.all([
      request(booted.http)
        .post(`/v1/customers/${customerId}/store-credit/adjust`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("Idempotency-Key", randomUUID())
        .send({
          amount_minor: "-800",
          currency_code: "USD",
          note_i18n: { en: "Debit A", ar: "خصم أ" },
        }),
      request(booted.http)
        .post(`/v1/customers/${customerId}/store-credit/adjust`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("Idempotency-Key", randomUUID())
        .send({
          amount_minor: "-800",
          currency_code: "USD",
          note_i18n: { en: "Debit B", ar: "خصم ب" },
        }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
    const fail = r1.status === 400 ? r1 : r2;
    expect(fail.body.code).toBe("insufficient_balance");

    // Ledger should have seed + exactly one debit (the successful one).
    const rows = await readLedgerRows(t.tenantId, customerId);
    expect(rows).toHaveLength(2);
    const final = await adminPrisma.customer.findUnique({
      where: { id: customerId },
      select: { store_credit_balance_minor: true },
    });
    expect(final!.store_credit_balance_minor).toBe(200n);
  });

  it("Audit row written on adjust includes before/after balance", async () => {
    const customerId = await makeCustomer(t.tenantId, { name: "Audit Target" });

    const res = await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "2500",
        currency_code: "USD",
        note_i18n: { en: "Bonus", ar: "مكافأة" },
      });
    expect(res.status).toBe(200);

    const rows = await readAuditLog(t.tenantId, "store_credit_adjusted");
    // Latest first.
    const mine = rows.find((r) => (r.after as { amount_minor?: string })?.amount_minor === "2500");
    expect(mine).toBeTruthy();
    expect((mine!.after as { balance_minor?: string }).balance_minor).toBe("2500");
  });

  it("GET 200 for owner/manager/accountant; GET 403 for cashier", async () => {
    const customerId = await makeCustomer(t.tenantId);
    await request(booted.http)
      .post(`/v1/customers/${customerId}/store-credit/adjust`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        amount_minor: "100",
        currency_code: "USD",
        note_i18n: { en: "Tiny", ar: "صغير" },
      });

    const o = await request(booted.http)
      .get(`/v1/customers/${customerId}/store-credit`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(o.status).toBe(200);
    expect(o.body.balance_minor).toBe("100");

    const a = await request(booted.http)
      .get(`/v1/customers/${customerId}/store-credit`)
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(a.status).toBe(200);

    const c = await request(booted.http)
      .get(`/v1/customers/${customerId}/store-credit`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(c.status).toBe(403);
  });
});
