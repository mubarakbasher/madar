"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Link } from "../../../../../i18n/routing";
import {
  customersListRequest,
  type ApiCustomerSummary,
} from "@/lib/api/customers";
import { formatMoney } from "@/lib/currency";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function formatCurrencyMinor(
  amountMinor: string | null | undefined,
  currency: string | null | undefined,
  locale: "en" | "ar",
): string {
  if (!amountMinor || !currency) return "—";
  return formatMoney(amountMinor, currency, locale);
}

function formatRelative(iso: string | null, locale: "en" | "ar"): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    numeric: "auto",
  });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

export function CustomersListClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("customers");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const listQ = useQuery({
    queryKey: ["customers", "list", { search: debounced.trim() }],
    queryFn: () =>
      customersListRequest({
        search: debounced.trim() || undefined,
        limit: 100,
      }),
    staleTime: 30_000,
  });

  const items = useMemo<ApiCustomerSummary[]>(() => listQ.data?.items ?? [], [listQ.data]);

  return (
    <div className="cu-page">
      <div className="cu-header">
        <div>
          <div className="cu-kicker">{t("kicker")}</div>
          <h1 className="cu-title">{t("listTitle")}</h1>
          <p className="cu-subtitle">{t("listSubtitle")}</p>
        </div>
        <div className="cu-actions">
          <Link href="/customers/new" className="cu-btn cu-btn-primary">
            <Plus size={16} strokeWidth={1.5} />
            {t("addCustomer")}
          </Link>
        </div>
      </div>

      <div className="cu-toolbar">
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            strokeWidth={1.5}
            style={{
              position: "absolute",
              insetInlineStart: 14,
              insetBlockStart: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-3)",
            }}
          />
          <input
            className="cu-search"
            style={{ paddingInlineStart: 40 }}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {listQ.isPending ? (
        <div className="cu-empty">{t("loading")}</div>
      ) : listQ.isError ? (
        <div className="cu-empty">
          <div className="cu-empty-title">{t("errorTitle")}</div>
          <p>{t("errorBody")}</p>
          <button type="button" className="cu-btn" onClick={() => listQ.refetch()}>
            {t("retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="cu-empty">
          <div className="cu-empty-title">{t("emptyTitle")}</div>
          <p>{t("emptyBody")}</p>
          <Link href="/customers/new" className="cu-btn cu-btn-primary" style={{ marginBlockStart: 16 }}>
            <Plus size={16} strokeWidth={1.5} />
            {t("addCustomer")}
          </Link>
        </div>
      ) : (
        <table className="cu-table">
          <thead>
            <tr>
              <th>{t("colName")}</th>
              <th>{t("colPhone")}</th>
              <th>{t("colEmail")}</th>
              <th>{t("colStoreCredit")}</th>
              <th>{t("colSalesCount")}</th>
              <th>{t("colLastSale")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <CustomerRow key={c.id} c={c} locale={locale} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CustomerRow({ c, locale }: { c: ApiCustomerSummary; locale: "en" | "ar" }) {
  return (
    <tr
      onClick={() => {
        window.location.assign(`/${locale}/customers/${c.id}`);
      }}
    >
      <td>
        <div className="cu-name">{c.name}</div>
        {c.code && <div className="cu-muted" style={{ fontSize: 11 }}>{c.code}</div>}
      </td>
      <td className="cu-muted">{c.phone ?? "—"}</td>
      <td className="cu-muted">{c.email ?? "—"}</td>
      <td>
        <span
          className={
            Number(c.store_credit_balance_minor) > 0
              ? "cu-balance-positive"
              : "cu-balance-zero"
          }
        >
          {formatCurrencyMinor(
            c.store_credit_balance_minor,
            c.store_credit_currency_code,
            locale,
          )}
        </span>
      </td>
      <td className="cu-muted">{c.sales_count}</td>
      <td className="cu-muted">{formatRelative(c.last_sale_at, locale)}</td>
    </tr>
  );
}
