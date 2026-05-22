"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { branchStockRequest } from "@/lib/api/branches";

function relTime(iso: string | null, locale: string, neverLabel: string): string {
  if (!iso) return neverLabel;
  const diffMs = Date.now() - new Date(iso).getTime();
  const fmt = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return fmt.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fmt.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  return fmt.format(-days, "day");
}

export function StockTab({ branchId, locale }: { branchId: string; locale: string }) {
  const t = useTranslations("branches.detail.stock");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const q = useQuery({
    queryKey: ["branches", "stock", branchId, search, lowOnly, page],
    queryFn: () => branchStockRequest(branchId, { search: search || undefined, low_only: lowOnly, page, limit }),
    staleTime: 15_000,
  });

  return (
    <section className="br-section">
      <h3 className="br-section-title">{t("title")}</h3>

      <div className="br-toolbar">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t("search")}
        />
        <label className="br-toggle">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          <span>{t("lowOnly")}</span>
        </label>
      </div>

      {q.isPending ? (
        <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>…</p>
      ) : q.isError ? (
        <p style={{ color: "var(--rose, #c45a5a)", fontSize: 13, margin: 0 }}>Error</p>
      ) : q.data.items.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
          {lowOnly ? t("lowEmpty") : t("empty")}
        </p>
      ) : (
        <table className="br-stock-table">
          <thead>
            <tr>
              <th>{t("headerProduct")}</th>
              <th>{t("headerSku")}</th>
              <th>{t("headerOnHand")}</th>
              <th>{t("headerReorder")}</th>
              <th>{t("headerAvailable")}</th>
              <th>{t("headerLastMovement")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((row) => {
              const low =
                row.reorder_point !== null && row.qty_on_hand < row.reorder_point;
              const name = locale === "ar" ? row.name_i18n.ar || row.name_i18n.en : row.name_i18n.en;
              return (
                <tr key={row.product_id}>
                  <td>{name}</td>
                  <td>{row.sku}</td>
                  <td className={low ? "br-stock-low" : ""}>{row.qty_on_hand}</td>
                  <td>{row.reorder_point ?? "—"}</td>
                  <td>{row.available}</td>
                  <td>{relTime(row.last_movement_at, locale, t("neverMoved"))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
