"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "../../../../../i18n/routing";
import { shiftsListRequest, type ApiCashierShift } from "@/lib/api/shifts";

type Tab = "open" | "closed" | "all";

function fmtCurrencyMinor(
  amountMinor: string | null | undefined,
  currency: string,
  locale: "en" | "ar",
): string {
  if (amountMinor == null) return "—";
  const major = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency,
  }).format(major);
}

function fmtDate(iso: string | null, locale: "en" | "ar"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ShiftsListClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("shifts");
  const [tab, setTab] = useState<Tab>("open");

  const q = useQuery({
    queryKey: ["shifts", "list", tab],
    queryFn: () =>
      shiftsListRequest({
        status: tab === "all" ? undefined : (tab as "open" | "closed"),
        limit: 100,
      }),
    staleTime: 15_000,
  });

  return (
    <div className="sh-page">
      <header className="sh-header">
        <div className="sh-kicker">{t("kicker")}</div>
        <h1 className="sh-title">{t("listTitle")}</h1>
        <p className="sh-subtitle">{t("listSubtitle")}</p>
      </header>

      <div className="sh-tabs" role="tablist">
        {(["open", "closed", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className="sh-tab"
            onClick={() => setTab(value)}
          >
            {t(`tabs.${value}`)}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="sh-empty">{t("loading")}</div>
      ) : q.isError ? (
        <div className="sh-empty">{t("errorBody")}</div>
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <div className="sh-empty">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginBlockEnd: 8 }}>
            {t("emptyTitle")}
          </div>
          <p>{t("emptyBody")}</p>
        </div>
      ) : (
        <table className="sh-table">
          <thead>
            <tr>
              <th>{t("colCashier")}</th>
              <th>{t("colBranch")}</th>
              <th>{t("colOpened")}</th>
              <th>{t("colClosed")}</th>
              <th>{t("colFloat")}</th>
              <th>{t("colVariance")}</th>
              <th>{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.items.map((s) => (
              <Row key={s.id} s={s} locale={locale} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Row({ s, locale }: { s: ApiCashierShift; locale: "en" | "ar" }) {
  const t = useTranslations("shifts");
  const varianceClass =
    s.variance_cents == null
      ? ""
      : Number(s.variance_cents) > 0
      ? "sh-variance-pos"
      : Number(s.variance_cents) < 0
      ? "sh-variance-neg"
      : "";
  return (
    <tr
      onClick={() => {
        window.location.assign(`/${locale}/shifts/${s.id}`);
      }}
    >
      <td>{s.cashier_name ?? s.cashier_id.slice(0, 6)}</td>
      <td>{s.branch_code}</td>
      <td>{fmtDate(s.opened_at, locale)}</td>
      <td>{fmtDate(s.closed_at, locale)}</td>
      <td>{fmtCurrencyMinor(s.opening_float_cents, s.currency_code, locale)}</td>
      <td className={varianceClass}>{fmtCurrencyMinor(s.variance_cents, s.currency_code, locale)}</td>
      <td>
        <span className={`sh-pill sh-pill-${s.status}`}>
          {t(`status.${s.status}`)}
        </span>
      </td>
    </tr>
  );
}
