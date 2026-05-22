"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { transfersListRequest, type TransferStatus, type ApiTransferSummary } from "@/lib/api/stock-transfers";
import { useAuthStore } from "@/lib/auth/store";
import "./transfers.css";

const STATUSES: { id: TransferStatus | "all"; key: "tabs.all" | "tabs.draft" | "tabs.in_transit" | "tabs.received" | "tabs.cancelled" }[] = [
  { id: "draft", key: "tabs.draft" },
  { id: "in_transit", key: "tabs.in_transit" },
  { id: "received", key: "tabs.received" },
  { id: "cancelled", key: "tabs.cancelled" },
  { id: "all", key: "tabs.all" },
];

function pickName(i18n: { en: string; ar: string } | null, locale: string): string {
  if (!i18n) return "—";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function relTime(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const fmt = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return fmt.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fmt.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  return fmt.format(-days, "day");
}

export function TransfersClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("transfers");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canCreate = role === "owner" || role === "manager";
  const [tab, setTab] = useState<TransferStatus | "all">("draft");

  const q = useQuery({
    queryKey: ["stock-transfers", "list", tab],
    queryFn: () => transfersListRequest({ status: tab === "all" ? undefined : tab }),
    staleTime: 15_000,
  });

  return (
    <div className="xfer">
      <header className="xfer-head">
        <div>
          <div className="xfer-kicker">{t("kicker")}</div>
          <h1 className="xfer-title">{t("title")}</h1>
          <p className="xfer-subtitle">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <a className="xfer-btn xfer-btn-primary" href={`/${locale}/transfers/new`}>
            <Plus size={14} strokeWidth={1.5} /> {t("newTransfer")}
          </a>
        )}
      </header>

      <div className="xfer-tabs">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`xfer-tab ${tab === s.id ? "xfer-tab-active" : ""}`}
            onClick={() => setTab(s.id)}
          >
            {t(s.key)}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="xfer-skeleton">{t("loading")}</div>
      ) : q.isError ? (
        <div className="xfer-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" onClick={() => void q.refetch()} className="xfer-btn">
            {t("error.retry")}
          </button>
        </div>
      ) : q.data.items.length === 0 ? (
        <div className="xfer-empty">
          <h2 className="xfer-empty-title">{t("empty.title")}</h2>
          <p className="xfer-empty-body">{t(`empty.body.${tab}`)}</p>
          {canCreate && (
            <a className="xfer-btn xfer-btn-primary" href={`/${locale}/transfers/new`}>
              {t("newTransfer")}
            </a>
          )}
        </div>
      ) : (
        <table className="xfer-table">
          <thead>
            <tr>
              <th>{t("table.code")}</th>
              <th>{t("table.from")}</th>
              <th>{t("table.to")}</th>
              <th>{t("table.items")}</th>
              <th>{t("table.status")}</th>
              <th>{t("table.created")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((r: ApiTransferSummary) => (
              <tr
                key={r.id}
                onClick={() => {
                  window.location.href = `/${locale}/transfers/${r.id}`;
                }}
                style={{ cursor: "pointer" }}
              >
                <td className="xfer-code">{r.code}</td>
                <td>{pickName(r.from_branch_name_i18n, locale)}</td>
                <td>{pickName(r.to_branch_name_i18n, locale)}</td>
                <td>
                  {r.line_count} · {r.total_qty_sent}
                </td>
                <td>
                  <span className={`xfer-pill xfer-pill-${r.status}`}>{t(`status.${r.status}`)}</span>
                </td>
                <td className="xfer-meta">{relTime(r.created_at, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
