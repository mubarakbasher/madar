import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateSaleInput } from "@/lib/api/sales";
import { MadarOfflineDB, _resetDb, getDb } from "./db";
import {
  enqueueProof,
  enqueueSale,
  getQueueDepth,
  listOutboxProofs,
  listOutboxSales,
  markProofFailed,
  markProofSynced,
  markSaleFailed,
  markSaleSynced,
  setProofAttempting,
  setSaleAttempting,
} from "./outbox";

beforeEach(async () => {
  _resetDb();
  await new MadarOfflineDB().delete();
  _resetDb();
  if (typeof window !== "undefined") window.localStorage.clear();
});

function makeSalePayload(client_uuid: string): CreateSaleInput {
  return {
    branch_id: "b1",
    customer_id: null,
    currency_code: "USD",
    payments: [{ method: "cash", amount_cents: "1000" }],
    client_uuid,
    client_sequence: null,
    lines: [{ product_id: "p1", qty: 1, line_discount_cents: 0, note: null }],
  };
}

describe("outbox: sales", () => {
  it("enqueueSale stamps id, client_uuid, sequence, status, timestamps", async () => {
    const r = await enqueueSale({
      tenant_id: "t1",
      payload: makeSalePayload("uuid-1"),
    });
    expect(r.id).toBeTruthy();
    expect(r.tenant_id).toBe("t1");
    expect(r.client_uuid).toBe("uuid-1");
    expect(r.client_sequence).toBe(1);
    expect(r.status).toBe("queued");
    expect(r.attempts).toBe(0);
    expect(r.last_attempt_at).toBeNull();
    expect(r.synced_sale_id).toBeNull();
  });

  it("listOutboxSales without status excludes synced rows", async () => {
    const a = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u-a") });
    const b = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u-b") });
    await markSaleSynced(a.id, "server-id-a");

    const pending = await listOutboxSales();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(b.id);

    const synced = await listOutboxSales("synced");
    expect(synced).toHaveLength(1);
    expect(synced[0]?.id).toBe(a.id);
  });

  it("markSaleSynced is idempotent and clears error", async () => {
    const r = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u1") });
    await markSaleFailed(r.id, "boom");
    await markSaleSynced(r.id, "server-id");
    await markSaleSynced(r.id, "server-id");
    const row = await getDb().outbox_sales.get(r.id);
    expect(row?.status).toBe("synced");
    expect(row?.synced_sale_id).toBe("server-id");
    expect(row?.error).toBeNull();
  });

  it("markSaleFailed increments attempts and setSaleAttempting marks syncing", async () => {
    const r = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u1") });
    await setSaleAttempting(r.id);
    let row = await getDb().outbox_sales.get(r.id);
    expect(row?.status).toBe("syncing");
    expect(row?.attempts).toBe(1);

    await markSaleFailed(r.id, "network");
    row = await getDb().outbox_sales.get(r.id);
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(2);
    expect(row?.error).toBe("network");
  });
});

describe("outbox: proofs", () => {
  function makeBlob(): Blob {
    return new Blob(["receipt-bytes"], { type: "image/png" });
  }

  it("enqueueProof + listOutboxProofs + markProofSynced roundtrip", async () => {
    const p = await enqueueProof({
      tenant_id: "t1",
      sale_uuid: "sale-uuid-1",
      blob: makeBlob(),
      mime: "image/png",
      payer_name: "Alice",
      transfer_reference: "REF-1",
      amount_cents: "5000",
      currency_code: "USD",
      bank_account_id: "ba1",
    });
    expect(p.status).toBe("queued");

    const pending = await listOutboxProofs();
    expect(pending).toHaveLength(1);

    await setProofAttempting(p.id);
    await markProofFailed(p.id, "scan-failed");
    let row = await getDb().outbox_proofs.get(p.id);
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(2);

    await markProofSynced(p.id);
    row = await getDb().outbox_proofs.get(p.id);
    expect(row?.status).toBe("synced");
    expect(row?.error).toBeNull();
  });
});

describe("getQueueDepth", () => {
  it("counts queued/syncing/failed across both outboxes but not synced", async () => {
    const s1 = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u1") });
    await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u2") });
    const s3 = await enqueueSale({ tenant_id: "t1", payload: makeSalePayload("u3") });
    await markSaleFailed(s3.id, "x"); // failed still counts
    await markSaleSynced(s1.id, "server-id"); // synced does not

    await enqueueProof({
      tenant_id: "t1",
      sale_uuid: "su",
      blob: new Blob(["x"]),
      mime: "image/png",
      payer_name: "p",
      transfer_reference: "r",
      amount_cents: "100",
      currency_code: "USD",
      bank_account_id: "ba1",
    });

    expect(await getQueueDepth()).toBe(3); // 2 sales (1 queued + 1 failed) + 1 proof
  });
});
