import type { ApiCategory, ApiProduct } from "@/lib/api/catalog";
import { getDb } from "./db";
import {
  CATALOG_SNAPSHOT_TTL_MS,
  type CatalogSnapshot,
  type CatalogSnapshotRecord,
} from "./types";

/**
 * Persist the full product + category lists for offline browsing. Two rows in
 * `catalog_snapshot` keyed by id ("products" / "categories"). Replaces any
 * existing rows. `synced_at` is captured once so both rows agree.
 */
export async function saveCatalogSnapshot(
  products: ApiProduct[],
  categories: ApiCategory[],
): Promise<void> {
  const synced_at = Date.now();
  const db = getDb();
  await db.catalog_snapshot.bulkPut([
    { id: "products", payload: products, synced_at },
    { id: "categories", payload: categories, synced_at },
  ]);
}

/**
 * Load both rows. Returns an empty snapshot when either row is missing — the
 * UI treats this as "no offline catalog yet, must fetch online".
 *
 * When both rows exist, `synced_at` is the MIN of the two (the snapshot is
 * only as fresh as the older half).
 */
export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const db = getDb();
  const [productsRow, categoriesRow] = await Promise.all([
    db.catalog_snapshot.get("products") as Promise<CatalogSnapshotRecord | undefined>,
    db.catalog_snapshot.get("categories") as Promise<CatalogSnapshotRecord | undefined>,
  ]);

  if (!productsRow || !categoriesRow) {
    return { products: [], categories: [], synced_at: null };
  }

  return {
    products: productsRow.payload as ApiProduct[],
    categories: categoriesRow.payload as ApiCategory[],
    synced_at: Math.min(productsRow.synced_at, categoriesRow.synced_at),
  };
}

/** True if the snapshot exists and is younger than `CATALOG_SNAPSHOT_TTL_MS`. */
export function isSnapshotFresh(snapshot: CatalogSnapshot): boolean {
  return (
    snapshot.synced_at !== null &&
    Date.now() - snapshot.synced_at < CATALOG_SNAPSHOT_TTL_MS
  );
}
