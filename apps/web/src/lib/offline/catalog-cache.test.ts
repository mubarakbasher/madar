import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiCategory, ApiProduct } from "@/lib/api/catalog";
import {
  isSnapshotFresh,
  loadCatalogSnapshot,
  saveCatalogSnapshot,
} from "./catalog-cache";
import { MadarOfflineDB, _resetDb, getDb } from "./db";
import { CATALOG_SNAPSHOT_TTL_MS } from "./types";

beforeEach(async () => {
  _resetDb();
  await new MadarOfflineDB().delete();
  _resetDb();
});

function makeProduct(id: string): ApiProduct {
  return {
    id,
    sku: `SKU-${id}`,
    name_i18n: { en: `Product ${id}`, ar: `منتج ${id}` },
    description_i18n: null,
    category_id: null,
    category_code: null,
    tax_class_id: null,
    tax_rate_pct: null,
    price_cents: "1000",
    cost_cents: "500",
    currency_code: "USD",
    barcode: null,
    is_active: true,
    image_url: null,
    qty_on_hand: 10,
    reorder_point: null,
    velocity_per_week: 0,
  };
}

function makeCategory(id: string): ApiCategory {
  return {
    id,
    code: `CAT-${id}`,
    name_i18n: { en: `Category ${id}`, ar: `فئة ${id}` },
    sort_order: 0,
    parent_id: null,
    product_count: 0,
  };
}

describe("catalog-cache", () => {
  it("returns an empty snapshot when nothing has been saved", async () => {
    const snap = await loadCatalogSnapshot();
    expect(snap).toEqual({ products: [], categories: [], synced_at: null });
  });

  it("save → load roundtrip preserves payload and stamps synced_at", async () => {
    const before = Date.now();
    await saveCatalogSnapshot([makeProduct("p1"), makeProduct("p2")], [makeCategory("c1")]);
    const after = Date.now();

    const snap = await loadCatalogSnapshot();
    expect(snap.products).toHaveLength(2);
    expect(snap.categories).toHaveLength(1);
    expect(snap.products[0]?.sku).toBe("SKU-p1");
    expect(snap.synced_at).not.toBeNull();
    expect(snap.synced_at!).toBeGreaterThanOrEqual(before);
    expect(snap.synced_at!).toBeLessThanOrEqual(after);
  });

  it("returns the empty snapshot if only one half exists", async () => {
    await getDb().catalog_snapshot.put({
      id: "products",
      payload: [makeProduct("p1")],
      synced_at: Date.now(),
    });
    const snap = await loadCatalogSnapshot();
    expect(snap.synced_at).toBeNull();
    expect(snap.products).toEqual([]);
  });

  it("isSnapshotFresh: true for recent, false when stale, false when null", () => {
    expect(isSnapshotFresh({ products: [], categories: [], synced_at: null })).toBe(false);
    expect(
      isSnapshotFresh({ products: [], categories: [], synced_at: Date.now() }),
    ).toBe(true);
    expect(
      isSnapshotFresh({
        products: [],
        categories: [],
        synced_at: Date.now() - CATALOG_SNAPSHOT_TTL_MS - 1,
      }),
    ).toBe(false);
  });
});
