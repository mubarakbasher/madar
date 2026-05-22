"use client";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { SaleResponse } from "@/lib/api/sales";
import { submitPaymentProof } from "@/lib/api/payment-proofs";
import {
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
import { subscribeOnlineEvents, useOnlineStatus } from "./online-status";
import {
  SYNC_MAX_ATTEMPTS,
  SYNC_POLL_MS,
  type OutboxProofRecord,
  type OutboxSaleRecord,
  type SyncSummary,
} from "./types";
import { getDb } from "./db";

let started = false;
let pollHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the sync loop. Idempotent — only the first call wires anything up.
 * Subsequent calls are no-ops.
 */
export function startSyncEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  subscribeOnlineEvents();

  // Push an initial queue-depth read so the UI shows the right number
  // before the first poll fires.
  void refreshQueueDepth();

  // Kick off immediately if there's anything queued + we're online.
  if (navigator.onLine) void syncOnce().catch(() => undefined);

  // Periodic poll while online; suspended when the tab hides.
  function startPoll() {
    if (pollHandle) return;
    pollHandle = setInterval(() => {
      if (!navigator.onLine) return;
      void syncOnce().catch(() => undefined);
    }, SYNC_POLL_MS);
  }
  function stopPoll() {
    if (!pollHandle) return;
    clearInterval(pollHandle);
    pollHandle = null;
  }
  startPoll();

  window.addEventListener("online", () => {
    startPoll();
    void syncOnce().catch(() => undefined);
  });
  window.addEventListener("offline", () => {
    // Keep the poll running — it self-skips when offline, and we'd lose
    // pollHandle reference if we cleared it here.
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopPoll();
    } else {
      startPoll();
      if (navigator.onLine) void syncOnce().catch(() => undefined);
    }
  });
}

async function refreshQueueDepth(): Promise<void> {
  const depth = await getQueueDepth();
  useOnlineStatus.getState().setQueueDepth(depth);
}

/**
 * Drain the outbox. Returns a summary of what happened.
 *
 * Sales first (each independent — a failed sale doesn't block the next).
 * Proofs second, only those whose parent sale has already synced.
 *
 * Re-entrancy is prevented by the `syncing` flag in the online-status store —
 * if a previous call is still running, we early-return with empty counts.
 */
export async function syncOnce(): Promise<SyncSummary> {
  const status = useOnlineStatus.getState();
  if (status.syncing) {
    return {
      sales_synced: 0,
      sales_failed: 0,
      sales_queued: 0,
      proofs_synced: 0,
      proofs_failed: 0,
      proofs_queued: 0,
    };
  }
  status.setSyncing(true);

  const summary: SyncSummary = {
    sales_synced: 0,
    sales_failed: 0,
    sales_queued: 0,
    proofs_synced: 0,
    proofs_failed: 0,
    proofs_queued: 0,
  };

  try {
    const sales = await listOutboxSales();
    for (const row of sales) {
      // Skip rows that have already exhausted their retries (permanent fail).
      if (row.status === "failed" && row.attempts >= SYNC_MAX_ATTEMPTS) continue;
      // The setSaleAttempting bump means we'll see attempts go up here.
      await setSaleAttempting(row.id);
      const result = await trySale(row);
      if (result === "synced") summary.sales_synced++;
      else if (result === "permanent") summary.sales_failed++;
      else summary.sales_queued++;
    }

    const proofs = await listOutboxProofs();
    for (const row of proofs) {
      if (row.status === "failed" && row.attempts >= SYNC_MAX_ATTEMPTS) continue;
      // Find the parent sale's synced id.
      const parent = await getDb()
        .outbox_sales.where("client_uuid")
        .equals(row.sale_uuid)
        .first();
      if (!parent || parent.status !== "synced" || !parent.synced_sale_id) {
        // Parent isn't ready — leave the proof queued.
        summary.proofs_queued++;
        continue;
      }
      await setProofAttempting(row.id);
      const result = await tryProof(row, parent.synced_sale_id);
      if (result === "synced") summary.proofs_synced++;
      else if (result === "permanent") summary.proofs_failed++;
      else summary.proofs_queued++;
    }
  } finally {
    status.setSyncing(false);
    await refreshQueueDepth();
    if (summary.sales_synced + summary.proofs_synced > 0) status.markSyncedNow();
  }

  return summary;
}

type AttemptResult = "synced" | "permanent" | "transient";

async function trySale(row: OutboxSaleRecord): Promise<AttemptResult> {
  // Augment the payload with the offline-specific fields.
  const body = {
    ...row.payload,
    client_uuid: row.client_uuid,
    client_sequence: row.client_sequence,
    client_occurred_at: row.occurred_at,
    offline_completed: true,
  };
  try {
    const sale = await apiFetch<SaleResponse>("/v1/sales", {
      method: "POST",
      body,
      idempotencyKey: row.client_uuid,
    });
    await markSaleSynced(row.id, sale.id);
    return "synced";
  } catch (err) {
    return await classifyAndRecord(err, async (kind, message) => {
      if (kind === "permanent") {
        await markSaleFailed(row.id, message);
      } else {
        // Transient — keep it queued so the next tick retries it.
        if (row.attempts + 1 >= SYNC_MAX_ATTEMPTS) {
          await markSaleFailed(row.id, message);
          return "permanent";
        }
        await getDb().outbox_sales.update(row.id, {
          status: "queued",
          error: message,
          last_attempt_at: Date.now(),
        });
      }
      return kind;
    });
  }
}

async function tryProof(row: OutboxProofRecord, saleId: string): Promise<AttemptResult> {
  const file = new File([row.blob], `receipt-${row.id.slice(0, 8)}.${mimeExt(row.mime)}`, {
    type: row.mime,
  });
  try {
    await submitPaymentProof({
      context: "sale",
      reference_id: saleId,
      amount_cents: row.amount_cents,
      currency_code: row.currency_code,
      bank_account_kind: "tenant",
      bank_account_id: row.bank_account_id,
      payer_name: row.payer_name,
      transfer_date: new Date(row.created_at).toISOString().slice(0, 10),
      transfer_reference: row.transfer_reference,
      receipt_file: file,
    });
    await markProofSynced(row.id);
    return "synced";
  } catch (err) {
    return await classifyAndRecord(err, async (kind, message) => {
      if (kind === "permanent") {
        await markProofFailed(row.id, message);
      } else {
        if (row.attempts + 1 >= SYNC_MAX_ATTEMPTS) {
          await markProofFailed(row.id, message);
          return "permanent";
        }
        await getDb().outbox_proofs.update(row.id, {
          status: "queued",
          error: message,
          last_attempt_at: Date.now(),
        });
      }
      return kind;
    });
  }
}

async function classifyAndRecord(
  err: unknown,
  record: (kind: "permanent" | "transient", message: string) => Promise<AttemptResult>,
): Promise<AttemptResult> {
  if (err instanceof ApiError) {
    const status = err.status;
    if (status >= 400 && status < 500) {
      return record("permanent", `${err.code}: ${err.message}`);
    }
    return record("transient", `${status}: ${err.message}`);
  }
  if (err instanceof Error) {
    return record("transient", err.message);
  }
  return record("transient", "Unknown error");
}

function mimeExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}
