"use client";

import { apiFetch } from "@/lib/api/client";
import type { CreateSaleInput, SaleResponse } from "@/lib/api/sales";
import { useAuthStore } from "@/lib/auth/store";
import { enqueueProof, enqueueSale } from "./outbox";
import { useOnlineStatus } from "./online-status";
import type {
  DispatchProofInput,
  DispatchProofOutcome,
  DispatchSaleOutcome,
} from "./types";

/**
 * Decide between an online POST and an IndexedDB enqueue based on connection
 * state + queue depth. On network errors during an online attempt, fall back
 * to the offline path so a transient blip doesn't lose the sale.
 */
export async function dispatchSale(input: CreateSaleInput): Promise<DispatchSaleOutcome> {
  const tenantId = useAuthStore.getState().tenant?.id;
  if (!tenantId) throw new Error("No tenant in scope — POS opened without auth");

  const { online, queueDepth, bumpQueueDepth } = useOnlineStatus.getState();

  if (online && queueDepth === 0) {
    try {
      const sale = await apiFetch<SaleResponse>("/v1/sales", {
        method: "POST",
        body: input,
        idempotencyKey: input.client_uuid,
      });
      return { kind: "online", sale };
    } catch (err) {
      // Permanent (4xx) errors should re-throw so the UI can show the message.
      // Transient errors fall through to the enqueue path.
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw err;
    }
  }

  const row = await enqueueSale({ tenant_id: tenantId, payload: input });
  bumpQueueDepth(1);
  return { kind: "queued", outbox_id: row.id };
}

/**
 * Queue a payment proof for later upload. dispatchProof is offline-first —
 * the sync engine resolves `sale_uuid` to a real `sale_id` once the parent
 * sale syncs, then POSTs the proof.
 *
 * For sales that complete online with a proof in the same step, callers
 * should bypass this and use `submitPaymentProof` directly — they already
 * have the real sale_id.
 */
export async function dispatchProof(input: DispatchProofInput): Promise<DispatchProofOutcome> {
  const tenantId = useAuthStore.getState().tenant?.id;
  if (!tenantId) throw new Error("No tenant in scope — POS opened without auth");

  const row = await enqueueProof({ tenant_id: tenantId, ...input });
  useOnlineStatus.getState().bumpQueueDepth(1);
  return { kind: "queued", outbox_id: row.id };
}
