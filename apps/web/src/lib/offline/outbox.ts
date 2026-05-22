import type { CreateSaleInput } from "@/lib/api/sales";
import { getDb } from "./db";
import { getNextSequence } from "./device";
import type {
  OutboxProofRecord,
  OutboxSaleRecord,
  OutboxStatus,
} from "./types";

// ─── sales ─────────────────────────────────────────────────────────

export interface EnqueueSaleInput {
  tenant_id: string;
  payload: CreateSaleInput;
}

export async function enqueueSale(input: EnqueueSaleInput): Promise<OutboxSaleRecord> {
  const record: OutboxSaleRecord = {
    id: crypto.randomUUID(),
    tenant_id: input.tenant_id,
    client_uuid: input.payload.client_uuid,
    client_sequence: getNextSequence(),
    occurred_at: new Date().toISOString(),
    payload: input.payload,
    status: "queued",
    attempts: 0,
    last_attempt_at: null,
    error: null,
    synced_sale_id: null,
    created_at: Date.now(),
  };
  await getDb().outbox_sales.add(record);
  return record;
}

/**
 * Lists rows ordered by created_at ASC. When `status` is omitted, returns
 * everything except `synced` (so a "pending" badge can count it).
 */
export async function listOutboxSales(status?: OutboxStatus): Promise<OutboxSaleRecord[]> {
  const db = getDb();
  if (status) {
    return db.outbox_sales.where("status").equals(status).sortBy("created_at");
  }
  const all = await db.outbox_sales.orderBy("created_at").toArray();
  return all.filter((r) => r.status !== "synced");
}

/** Idempotent — re-running with the same id is a no-op aside from timestamps. */
export async function markSaleSynced(id: string, sale_id: string): Promise<void> {
  await getDb().outbox_sales.update(id, {
    status: "synced",
    synced_sale_id: sale_id,
    error: null,
    last_attempt_at: Date.now(),
  });
}

export async function markSaleFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox_sales, async () => {
    const row = await db.outbox_sales.get(id);
    if (!row) return;
    await db.outbox_sales.update(id, {
      status: "failed",
      error,
      last_attempt_at: Date.now(),
      attempts: row.attempts + 1,
    });
  });
}

export async function setSaleAttempting(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox_sales, async () => {
    const row = await db.outbox_sales.get(id);
    if (!row) return;
    await db.outbox_sales.update(id, {
      status: "syncing",
      attempts: row.attempts + 1,
      last_attempt_at: Date.now(),
    });
  });
}

// ─── proofs ────────────────────────────────────────────────────────

export interface EnqueueProofInput {
  tenant_id: string;
  sale_uuid: string;
  blob: Blob;
  mime: string;
  payer_name: string;
  transfer_reference: string;
  amount_cents: string;
  currency_code: string;
  bank_account_id: string;
}

export async function enqueueProof(input: EnqueueProofInput): Promise<OutboxProofRecord> {
  const record: OutboxProofRecord = {
    id: crypto.randomUUID(),
    tenant_id: input.tenant_id,
    sale_uuid: input.sale_uuid,
    blob: input.blob,
    mime: input.mime,
    payer_name: input.payer_name,
    transfer_reference: input.transfer_reference,
    amount_cents: input.amount_cents,
    currency_code: input.currency_code,
    bank_account_id: input.bank_account_id,
    status: "queued",
    attempts: 0,
    last_attempt_at: null,
    error: null,
    created_at: Date.now(),
  };
  await getDb().outbox_proofs.add(record);
  return record;
}

export async function listOutboxProofs(status?: OutboxStatus): Promise<OutboxProofRecord[]> {
  const db = getDb();
  if (status) {
    return db.outbox_proofs.where("status").equals(status).sortBy("created_at");
  }
  const all = await db.outbox_proofs.orderBy("created_at").toArray();
  return all.filter((r) => r.status !== "synced");
}

export async function markProofSynced(id: string): Promise<void> {
  await getDb().outbox_proofs.update(id, {
    status: "synced",
    error: null,
    last_attempt_at: Date.now(),
  });
}

export async function markProofFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox_proofs, async () => {
    const row = await db.outbox_proofs.get(id);
    if (!row) return;
    await db.outbox_proofs.update(id, {
      status: "failed",
      error,
      last_attempt_at: Date.now(),
      attempts: row.attempts + 1,
    });
  });
}

export async function setProofAttempting(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox_proofs, async () => {
    const row = await db.outbox_proofs.get(id);
    if (!row) return;
    await db.outbox_proofs.update(id, {
      status: "syncing",
      attempts: row.attempts + 1,
      last_attempt_at: Date.now(),
    });
  });
}

// ─── shared ────────────────────────────────────────────────────────

const PENDING_STATUSES: OutboxStatus[] = ["queued", "syncing", "failed"];

/**
 * Total non-synced rows across both outboxes. Failed counts because the user
 * may retry them — they still represent work the UI owes.
 */
export async function getQueueDepth(): Promise<number> {
  const db = getDb();
  const [sales, proofs] = await Promise.all([
    db.outbox_sales.where("status").anyOf(PENDING_STATUSES).count(),
    db.outbox_proofs.where("status").anyOf(PENDING_STATUSES).count(),
  ]);
  return sales + proofs;
}
