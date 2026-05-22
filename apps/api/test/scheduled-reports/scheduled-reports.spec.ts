import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { adminPrisma } from "@madar/db";
import { bootTestApp, type BootedTestApp } from "../helpers/app";
import { TokenService } from "../../src/tenant/auth/token.service";
import {
  makeTenant,
  makeTenantWithCatalog,
  readAuditLog,
  type TenantFixture,
  type TenantWithCatalogFixture,
} from "../helpers/fixtures";

/**
 * Slice 5 — scheduled reports CRUD + Run-now.
 *
 * Vitest runs without REDIS_URL (see test/setup.ts), so the BullMQ queue is
 * not wired. `Run now` therefore exercises the inline-fallback path in
 * `ScheduledReportQueue.enqueueRunNow`, which in turn calls
 * `runScheduledReportJob` directly. That's exactly the production path when
 * Redis is unavailable, so this is a real integration test of the worker.
 */
describe("Scheduled reports (/v1/scheduled-reports)", () => {
  let booted: BootedTestApp;
  let tokens: TokenService;
  let t: TenantWithCatalogFixture;
  let ownerToken: string;
  let managerToken: string;
  let accountantToken: string;
  let cashierToken: string;
  let otherTenant: TenantFixture;
  let otherOwnerToken: string;

  beforeAll(async () => {
    booted = await bootTestApp();
    tokens = booted.app.get(TokenService);
    t = await makeTenantWithCatalog({ slugPrefix: "sched-rpt" });
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

    otherTenant = await makeTenant({ slugPrefix: "sched-rls" });
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

  function uniqueName(): string {
    return `Daily P&L ${randomUUID().slice(0, 8)}`;
  }

  // ── 1. RBAC list ─────────────────────────────────────────────────────
  it("GET list: cashier 403; owner/manager/accountant 200", async () => {
    const owner = await request(booted.http)
      .get("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(owner.status).toBe(200);
    expect(Array.isArray(owner.body.items)).toBe(true);

    const mgr = await request(booted.http)
      .get("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(mgr.status).toBe(200);

    const acct = await request(booted.http)
      .get("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(acct.status).toBe(200);

    const cashier = await request(booted.http)
      .get("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(cashier.status).toBe(403);
    expect(cashier.body.code).toBe("forbidden_role");
  });

  // ── 2. RBAC mutations ────────────────────────────────────────────────
  it("POST: cashier 403; manager 403 (owner|accountant only)", async () => {
    const body = {
      name: uniqueName(),
      report_kind: "pnl",
      cadence: "daily",
      recipients: ["a@example.test"],
      format: "csv",
      params: {},
    };

    const cashier = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${cashierToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(cashier.status).toBe(403);
    expect(cashier.body.code).toBe("forbidden_role");

    const mgr = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(mgr.status).toBe(403);
    expect(mgr.body.code).toBe("forbidden_role");
  });

  // ── 3. Happy create + audit + cron_pattern from cadence ──────────────
  it("POST happy: owner creates a schedule + audit row + cron_pattern derived", async () => {
    const res = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: uniqueName(),
        report_kind: "pnl",
        cadence: "weekly",
        recipients: ["weekly@example.test"],
        format: "csv",
        params: { currency: "USD" },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.is_active).toBe(true);
    expect(res.body.cron_pattern).toBe("0 9 * * 1");
    expect(res.body.recipients).toEqual(["weekly@example.test"]);

    const audit = await readAuditLog(t.tenantId, "scheduled_report_created");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]!.after).toMatchObject({
      cadence: "weekly",
      cron_pattern: "0 9 * * 1",
      recipients_count: 1,
    });
  });

  // ── 4. Update toggles is_active + audit ─────────────────────────────
  it("PATCH toggles is_active + audit row written", async () => {
    const create = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: uniqueName(),
        report_kind: "tax",
        cadence: "monthly",
        recipients: ["m@example.test"],
        format: "pdf",
        params: { currency: "USD" },
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;
    expect(create.body.cron_pattern).toBe("0 9 1 * *");

    // Accountant can also write.
    const patch = await request(booted.http)
      .patch(`/v1/scheduled-reports/${id}`)
      .set("Authorization", `Bearer ${accountantToken}`)
      .send({ is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.is_active).toBe(false);

    const audit = await readAuditLog(t.tenantId, "scheduled_report_updated");
    expect(audit.length).toBeGreaterThan(0);
  });

  // ── 5. Run-now returns {queued:true}; last_run_at populated ─────────
  it("POST /:id/run-now returns 200 {queued:true} and populates last_run_at", async () => {
    const create = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: uniqueName(),
        report_kind: "pnl",
        cadence: "daily",
        recipients: [`runnow-${randomUUID().slice(0, 6)}@example.test`],
        format: "csv",
        params: { currency: "USD" },
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const run = await request(booted.http)
      .post(`/v1/scheduled-reports/${id}/run-now`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID());
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ id, queued: true });

    // The queue's inline fallback runs synchronously in tests, so the row
    // should already carry a `last_run_at` by the time the response returns.
    const row = await adminPrisma.scheduledReport.findUnique({ where: { id } });
    expect(row?.last_run_at).toBeTruthy();
    expect(["sent", "failed"]).toContain(row?.last_status ?? "");

    const audit = await readAuditLog(t.tenantId, "scheduled_report_fired_manually");
    expect(audit.length).toBeGreaterThan(0);
    const fired = await readAuditLog(t.tenantId, "scheduled_report_fired");
    expect(fired.length).toBeGreaterThan(0);
  });

  // ── 6. RLS canary ────────────────────────────────────────────────────
  it("RLS canary: tenant B cannot see / patch tenant A's schedule", async () => {
    const create = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: uniqueName(),
        report_kind: "trends",
        cadence: "daily",
        recipients: ["hidden@example.test"],
        format: "csv",
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const peek = await request(booted.http)
      .patch(`/v1/scheduled-reports/${id}`)
      .set("Authorization", `Bearer ${otherOwnerToken}`)
      .send({ name: "Steal me" });
    expect(peek.status).toBe(404);
    expect(peek.body.code).toBe("scheduled_report_not_found");
  });

  // ── 7. Soft-delete excludes from list ───────────────────────────────
  it("DELETE soft-deletes + subsequent list excludes; second DELETE 404", async () => {
    const create = await request(booted.http)
      .post("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        name: uniqueName(),
        report_kind: "pnl",
        cadence: "daily",
        recipients: ["delete-me@example.test"],
        format: "csv",
      });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const r1 = await request(booted.http)
      .delete(`/v1/scheduled-reports/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.deleted_at).toBeTruthy();

    const list = await request(booted.http)
      .get("/v1/scheduled-reports")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.find((x: { id: string }) => x.id === id)).toBeUndefined();

    const r2 = await request(booted.http)
      .delete(`/v1/scheduled-reports/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(r2.status).toBe(404);
    expect(r2.body.code).toBe("scheduled_report_not_found");

    const audit = await readAuditLog(t.tenantId, "scheduled_report_deleted");
    expect(audit.length).toBeGreaterThan(0);
  });
});
