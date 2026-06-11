"use client";

import { useTranslations } from "next-intl";
import {
  Banknote,
  CreditCard,
  Landmark,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatNumber, minorToMajor } from "@/lib/currency";
import type {
  ApiOwnerDashboardRecentTx,
} from "@/lib/api/dashboard";

// API payment_method values come straight from `sales.payment_method`.
// Today the schema is `cash | bank_transfer`; spec also reserves
// `card | manual_card | store_credit | split` for the strategy pattern.
const METHOD_ICON: Record<string, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  manual_card: CreditCard,
  bank_transfer: Landmark,
  store_credit: Wallet,
  split: Receipt,
};

const KNOWN_METHODS = new Set([
  "cash",
  "card",
  "manual_card",
  "bank_transfer",
  "store_credit",
]);

const STATUS_CLASS: Record<
  ApiOwnerDashboardRecentTx["payment_status"],
  string
> = {
  paid: "dash-tx-pill dash-tx-pill-paid",
  payment_pending: "dash-tx-pill dash-tx-pill-pending",
  disputed: "dash-tx-pill dash-tx-pill-disputed",
  refunded: "dash-tx-pill dash-tx-pill-refunded",
};

function symbolFor(currency: string, locale: string): string {
  if (currency === "EGP") return locale === "ar" ? "ج.م" : "£";
  try {
    const parts = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

// Render an ISO timestamp as "Xm ago" / "Xh ago" via Intl.RelativeTimeFormat
// (locale-aware: "منذ ١٢ دقيقة" in Arabic). Falls back to the date string on
// invalid input.
function formatAgo(iso: string, locale: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diffMs = Date.now() - ts;
  const rtf = new Intl.RelativeTimeFormat(
    locale === "ar" ? "ar-EG" : "en-EG",
    { numeric: "auto" },
  );
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return rtf.format(-sec, "second");
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  return rtf.format(-day, "day");
}

interface RecentTxCardProps {
  recent_transactions: ApiOwnerDashboardRecentTx[];
  currency_code: string;
  locale: string;
}

export function RecentTxCard({
  recent_transactions,
  currency_code,
  locale,
}: RecentTxCardProps) {
  const t = useTranslations("dashboard.recent");
  const tMethod = useTranslations("dashboard.recent.method");
  const tStatus = useTranslations("dashboard.recent.status");
  const cur = symbolFor(currency_code, locale);

  if (recent_transactions.length === 0) {
    return (
      <div className="dash-card">
        <header className="dash-card-h">
          <div>
            <div className="dash-card-title">{t("title")}</div>
          </div>
        </header>
        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 13,
            margin: 0,
            padding: "18px 0",
          }}
        >
          {t("empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <header className="dash-card-h">
        <div>
          <div className="dash-card-title">{t("title")}</div>
        </div>
      </header>
      <div>
        {recent_transactions.slice(0, 7).map((tx) => {
          const Icon = METHOD_ICON[tx.payment_method] ?? Receipt;
          const methodLabel = KNOWN_METHODS.has(tx.payment_method)
            ? tMethod(tx.payment_method as "cash")
            : tx.payment_method;
          // Intentionally rounded to whole major units — compact dashboard row.
          const total = Math.round(minorToMajor(tx.total_cents, currency_code));
          return (
            <div key={tx.id} className="dash-tx-row">
              <Icon
                size={12}
                strokeWidth={1.5}
                style={{ color: "var(--ink-3)" }}
                aria-label={methodLabel}
              />
              <div style={{ minWidth: 0 }}>
                <div className="dash-tx-id">{tx.code}</div>
                <div className="dash-tx-meta">
                  {tx.branch_code}
                  {tx.cashier_name ? ` · ${tx.cashier_name}` : ""}
                  {" · "}
                  {t("items", { count: tx.items })}
                </div>
              </div>
              <span className={STATUS_CLASS[tx.payment_status]}>
                {tStatus(tx.payment_status)}
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {formatAgo(tx.occurred_at, locale)}
              </span>
              <span className="dash-tx-total">
                <span
                  style={{
                    fontSize: "0.7em",
                    color: "var(--ink-3)",
                    marginInlineEnd: 2,
                  }}
                >
                  {cur}
                </span>
                {formatNumber(total, locale)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
