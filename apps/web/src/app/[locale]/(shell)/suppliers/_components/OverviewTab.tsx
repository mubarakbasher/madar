"use client";

import type { ApiSupplierDetail } from "@/lib/api/suppliers";
import { SupplierScorecard } from "./SupplierScorecard";
import { SupplierAlerts } from "./SupplierAlerts";
import { OrderHistoryTable } from "./OrderHistoryTable";

function pickName(i18n: { en: string; ar: string }, locale: string): string {
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

export function OverviewTab({
  supplier,
  locale,
  onSwitchToActivity,
}: {
  supplier: ApiSupplierDetail;
  locale: "en" | "ar";
  onSwitchToActivity?: () => void;
}) {
  // Pick the most-recent PO occurrence from recent_activity (kind='po').
  const lastOrderAt =
    supplier.recent_activity.find((a) => a.kind === "po")?.occurred_at ?? null;
  const name = pickName(supplier.name_i18n, locale);

  return (
    <>
      <SupplierAlerts
        stats={supplier.stats}
        supplierName={name}
        onReview={onSwitchToActivity}
      />
      <SupplierScorecard
        stats={supplier.stats}
        currencyCode={supplier.currency_code}
        lastOrderAt={lastOrderAt}
        locale={locale}
      />
      <OrderHistoryTable supplierId={supplier.id} locale={locale} />
    </>
  );
}
