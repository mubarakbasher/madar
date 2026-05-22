"use client";

import { useTranslations } from "next-intl";

export function BulkActionBar({
  count,
  onClear,
  onEditPrice,
  onAdjustStock,
  onPrintLabels,
}: {
  count: number;
  onClear: () => void;
  onEditPrice: () => void;
  onAdjustStock: () => void;
  onPrintLabels: () => void;
}) {
  const t = useTranslations("inventory.bulk");

  return (
    <div className="inv-bulk">
      <span className="inv-bulk-count">{t("selected", { count })}</span>
      <button type="button" className="inv-btn" onClick={onEditPrice}>
        {t("editPrice")}
      </button>
      <button type="button" className="inv-btn" onClick={onAdjustStock}>
        {t("adjustStock")}
      </button>
      <button type="button" className="inv-btn" onClick={onPrintLabels}>
        {t("printLabels")}
      </button>
      <span style={{ flex: 1 }} />
      <button type="button" className="inv-btn inv-btn-ghost" onClick={onClear}>
        {t("clear")}
      </button>
    </div>
  );
}
