import Dexie, { type Table } from "dexie";
import type {
  CatalogSnapshotRecord,
  OutboxProofRecord,
  OutboxSaleRecord,
} from "./types";

export class MadarOfflineDB extends Dexie {
  catalog_snapshot!: Table<CatalogSnapshotRecord, string>;
  outbox_sales!: Table<OutboxSaleRecord, string>;
  outbox_proofs!: Table<OutboxProofRecord, string>;

  constructor() {
    super("madar_offline_v1");
    this.version(1).stores({
      catalog_snapshot: "id, synced_at",
      outbox_sales: "id, status, [tenant_id+status], client_uuid, created_at",
      outbox_proofs: "id, status, sale_uuid, created_at",
    });
  }
}

// Lazy singleton so tests can reset.
let _db: MadarOfflineDB | null = null;

export function getDb(): MadarOfflineDB {
  if (!_db) _db = new MadarOfflineDB();
  return _db;
}

/** Test-only: close + null. Tests using fake-indexeddb create a fresh DB per file. */
export function _resetDb(): void {
  if (_db) _db.close();
  _db = null;
}
