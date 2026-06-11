import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";
import type { ApiCategory, ApiProduct } from "./catalog";

import { currencyMinorUnits } from "@/lib/currency";
import { swatchFromId } from "@/lib/swatch";

function colorFromId(id: string): string {
  return swatchFromId(id);
}

/**
 * Convert string-encoded minor units → major units using the currency's real
 * precision (KWD=3, JPY=0, default 2). Rounded to that precision so the float
 * is display-stable.
 */
function centsToMajor(cents: string, currencyCode: string): number {
  const n = Number(BigInt(cents));
  const minorUnits = currencyMinorUnits(currencyCode);
  if (minorUnits === 0) return n;
  const divisor = 10 ** minorUnits;
  return Math.round((n / divisor) * divisor) / divisor;
}

function pickName(name_i18n: { en: string; ar: string }, locale: "en" | "ar"): string {
  return name_i18n[locale] ?? name_i18n.en ?? "";
}

export function adaptProduct(
  p: ApiProduct,
  locale: "en" | "ar",
  currencyCode: string,
): Product {
  return {
    id: p.id,
    sku: p.sku,
    cat: p.category_code ?? "uncategorized",
    name: pickName(p.name_i18n, locale),
    price: centsToMajor(p.price_cents, currencyCode),
    cost: centsToMajor(p.cost_cents, currencyCode),
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
