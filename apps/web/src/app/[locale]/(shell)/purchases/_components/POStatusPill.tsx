"use client";

import { useTranslations } from "next-intl";
import type { PurchaseOrderStatus } from "@/lib/api/purchase-orders";

/**
 * Status pill — token-driven. Visual semantics per task spec:
 *  draft     → ink-3 neutral (unstarted)
 *  ordered   → accent (brand) (in flight)
 *  received  → sage (good outcome)
 *  cancelled → rose (terminated)
 */
export function POStatusPill({ status }: { status: PurchaseOrderStatus }) {
  const t = useTranslations("purchases.status");
  return (
    <span className={`po-pill po-pill-${status}`}>{t(status)}</span>
  );
}
