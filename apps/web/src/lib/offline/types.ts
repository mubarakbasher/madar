/**
 * Shared contract for the offline-POS layer. Used by:
 *  - Slice 2 (db / outbox / catalog-cache) — implements the persistence side.
 *  - Slice 3 (sync engine / online-status / dispatch) — implements the network side.
 *  - Slice 5 (POS UI + conflict page) — consumes both via dispatch().
 *
 * The interfaces live here so the three slices can compile against the same
 * shape without depending on each other's implementations.
 */

import type { ApiCategory, ApiProduct } from "@/lib/api/catalog";
import type { CreateSaleInput, SaleResponse } from "@/lib/api/sales";

// ─── outbox: sales ──────────────────────────────────────────────────

export type OutboxStatus = "queued" | "syncing" | "synced" | "failed";

export interface OutboxSaleRecord {
  /** Local primary key — uuid generated when enqueueing. */
  id: string;
  tenant_id: string;
  /** Mirrors CreateSaleInput.client_uuid; doubles as the Idempotency-Key. */
  client_uuid: string;
  /** Monotonic per-device sequence used for stable order on sync. */
  client_sequence: number;
  /** Wall-clock at the offline POS when the sale was rang. ISO 8601. */
  occurred_at: string;
  /** Full request body that will be replayed verbatim at sync time. */
  payload: CreateSaleInput;
  status: OutboxStatus;
  attempts: number;
  last_attempt_at: number | null;
  error: string | null;
  /** Set when status flips to 'synced'. The server's sale.id. */
  synced_sale_id: string | null;
  created_at: number;
}

// ─── outbox: payment proofs ─────────────────────────────────────────

export interface OutboxProofRecord {
  id: string;
  tenant_id: string;
  /** The offline sale's client_uuid. Resolved to a real sale_id at sync time. */
  sale_uuid: string;
  /** Captured receipt file kept as a Blob in IndexedDB. */
  blob: Blob;
  mime: string;
  payer_name: string;
  transfer_reference: string;
  amount_cents: string;
  currency_code: string;
  bank_account_id: string;
  status: OutboxStatus;
  attempts: number;
  last_attempt_at: number | null;
  error: string | null;
  created_at: number;
}

// ─── catalog snapshot ───────────────────────────────────────────────

export type CatalogSnapshotId = "products" | "categories";

export interface CatalogSnapshotRecord {
  id: CatalogSnapshotId;
  /** Either ApiProduct[] or ApiCategory[] depending on `id`. */
  payload: ApiProduct[] | ApiCategory[];
  synced_at: number;
}

export interface CatalogSnapshot {
  products: ApiProduct[];
  categories: ApiCategory[];
  /** Most recent synced_at across both stores; null if either is missing. */
  synced_at: number | null;
}

// ─── online-status store (Slice 3) ──────────────────────────────────

export interface OnlineStatus {
  online: boolean;
  queueDepth: number;
  syncing: boolean;
  lastSyncedAt: number | null;
}

// ─── dispatch contract (Slice 3, consumed by Slice 5) ───────────────

export interface DispatchProofInput {
  sale_uuid: string;
  blob: Blob;
  mime: string;
  payer_name: string;
  transfer_reference: string;
  amount_cents: string;
  currency_code: string;
  bank_account_id: string;
}

export type DispatchSaleOutcome =
  /** The sale went straight through and the server confirmed it. */
  | { kind: "online"; sale: SaleResponse }
  /** The sale was enqueued; the UI should show a "queued" placeholder. */
  | { kind: "queued"; outbox_id: string };

export type DispatchProofOutcome =
  | { kind: "online" }
  | { kind: "queued"; outbox_id: string };

// ─── sync engine summary (Slice 3) ──────────────────────────────────

export interface SyncSummary {
  sales_synced: number;
  sales_failed: number;
  sales_queued: number;
  proofs_synced: number;
  proofs_failed: number;
  proofs_queued: number;
}

/** How long a single sync attempt may sit in `syncing` before the engine resumes. */
export const SYNC_MAX_ATTEMPTS = 10;

/** Maximum age for a catalog snapshot before we force a fresh fetch (when online). */
export const CATALOG_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/** Sync poll cadence while online with non-empty queue. */
export const SYNC_POLL_MS = 30_000;
