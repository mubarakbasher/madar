"use client";

import { useTranslations } from "next-intl";
import type { SupplierReturnStatus } from "@/lib/api/supplier-returns";

/**
 * Status pill — token-driven. Visual semantics per task spec:
 *  draft     → ink-3 neutral (unstarted)
 *  sent      → accent (brand) (in flight)
 *  refunded  → sage (good outcome)
 *  cancelled → rose (terminated)
 *
 * Same mapping shape as POStatusPill but with rma-pill-* classes.
 */
export function ReturnStatusPill({ status }: { status: SupplierReturnStatus }) {
  const t = useTranslations("returns.status");
  return <span className={`rma-pill rma-pill-${status}`}>{t(status)}</span>;
}
