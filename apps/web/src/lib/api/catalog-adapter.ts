import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";
import type { ApiCategory, ApiProduct } from "./catalog";

// Eight-entry warm palette aligned with design tokens — deterministic by id.
const COLOR_PALETTE = [
  "#3D2817", // espresso bean
  "#6B3F1D", // chocolate
  "#A8693B", // amber roast
  "#C96442", // accent terracotta
  "#5F4830", // walnut
  "#8B6B45", // toffee
  "#3F5A47", // sage
  "#7A4A3F", // brick
];

function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]!;
}

/**
 * Convert string-encoded cents → integer major units.
 * For EGP/USD (2 minor units) and JPY (0), the legacy mock data uses whole
 * units. We default to 2 here; the JPY-style edge case lands with the
 * currency_minor_units lookup in a later slice.
 */
function centsToMajor(cents: string, minorUnits = 2): number {
  const n = Number(BigInt(cents));
  if (minorUnits === 0) return n;
  const divisor = 10 ** minorUnits;
  return Math.round((n / divisor) * 100) / 100;
}

function pickName(name_i18n: { en: string; ar: string }, locale: "en" | "ar"): string {
  return name_i18n[locale] ?? name_i18n.en ?? "";
}

export function adaptProduct(p: ApiProduct, locale: "en" | "ar"): Product {
  return {
    id: p.id,
    sku: p.sku,
    cat: p.category_code ?? "uncategorized",
    name: pickName(p.name_i18n, locale),
    price: centsToMajor(p.price_cents),
    cost: centsToMajor(p.cost_cents),
    stock: p.qty_on_hand,
    // No reorder point → never "low". `low` is compared as `stock < low`, so the
    // sentinel must be -Infinity (always false) — NOT +Infinity, which would make
    // every product without a reorder point read as low stock.
    low: p.reorder_point ?? Number.NEGATIVE_INFINITY,
    vel: p.velocity_per_week,
    color: colorFromId(p.id),
    image_url: p.image_url,
  };
}

export function adaptCategory(c: ApiCategory, _locale: "en" | "ar"): Category {
  return {
    id: c.code,
    name: c.name_i18n.en,
    nameAr: c.name_i18n.ar,
    count: c.product_count,
  };
}
