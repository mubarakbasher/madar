"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FolderTree, Package, Plus, ScrollText, ShoppingCart, Upload } from "lucide-react";
import { Link } from "../../../../../../i18n/routing";
import { formatNumber } from "@/lib/currency";
import { ImportCsvModal } from "./ImportCsvModal";

export function InventoryHeader({
  skuCount,
  onHandValue,
  lowCount,
  locale,
  branchId,
  canReorder,
}: {
  skuCount: number;
  onHandValue: number;
  lowCount: number;
  locale: "en" | "ar" | string;
  branchId: string | null;
  canReorder: boolean;
}) {
  const t = useTranslations("inventory");
  const cur = locale === "ar" ? "ج.م" : "£";
  const showReorder = canReorder && lowCount > 0 && !!branchId;
  const [importing, setImporting] = useState(false);

  return (
    <header className="inv-head">
      <div>
        <span className="kicker">{t("kicker")}</span>
        <h1 className="inv-head-title">{t("title")}</h1>
        <p className="inv-head-sub">
          <span>
            <strong className="tnum">{formatNumber(skuCount, locale)}</strong>{" "}
            {t("summary.skus")}
          </span>
          <span>·</span>
          <span>
            <strong className="tnum">
              {cur}
              {formatNumber(onHandValue, locale)}
            </strong>{" "}
            {t("summary.onHand")}
          </span>
          <span>·</span>
          <span>
            <strong className="tnum">{formatNumber(lowCount, locale)}</strong>{" "}
            {t("summary.lowStock")}
          </span>
        </p>
      </div>
      <div className="inv-head-actions">
        {showReorder && (
          <a
            href={`/${locale}/purchases/new?prefill=lowstock&branch_id=${encodeURIComponent(
              branchId!,
            )}`}
            className="inv-btn"
          >
            <ShoppingCart size={13} strokeWidth={1.5} />
            {t("actions.reorderLowStock")}
          </a>
        )}
        <button type="button" className="inv-btn">
          <Download size={13} strokeWidth={1.5} />
          {t("actions.export")}
        </button>
        <button type="button" className="inv-btn" onClick={() => setImporting(true)}>
          <Upload size={13} strokeWidth={1.5} />
          {t("actions.importCsv")}
        </button>
        <Link href="/inventory/categories" className="inv-btn">
          <FolderTree size={13} strokeWidth={1.5} />
          {t("actions.categories")}
        </Link>
        <Link href={"/inventory/movements" as "/inventory/categories"} className="inv-btn">
          <ScrollText size={13} strokeWidth={1.5} />
          {t("actions.movements")}
        </Link>
        <button type="button" className="inv-btn">
          <Package size={13} strokeWidth={1.5} />
          {t("actions.stockTransfer")}
        </button>
        <Link href="/inventory/products/new" className="inv-btn inv-btn-primary">
          <Plus size={13} strokeWidth={1.5} />
          {t("actions.newProduct")}
        </Link>
      </div>
      {importing && <ImportCsvModal onClose={() => setImporting(false)} />}
    </header>
  );
}
