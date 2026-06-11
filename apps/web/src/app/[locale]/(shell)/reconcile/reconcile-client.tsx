"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import {
  reconcileDayRequest,
  type ReconcileBranch,
  type ReconcileTotals,
} from "@/lib/api/reconcile";
import { useAuthStore } from "@/lib/auth/store";
import { currencyMinorUnits, formatMoney, minorToMajor } from "@/lib/currency";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(cents: string, currency: string, locale: "en" | "ar"): string {
  try {
    return formatMoney(cents, currency || "USD", locale);
  } catch {
    return `${currency} ${minorToMajor(cents, currency).toFixed(currencyMinorUnits(currency))}`;
  }
}

export function ReconcileClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("reconcile");
  const tenant = useAuthStore((s) => s.tenant);
  const currency = tenant?.default_currency_code ?? "USD";

  const [date, setDate] = useState(todayIso());

  const q = useQuery({
    queryKey: ["reconcile", "day", date],
    queryFn: () => reconcileDayRequest({ date }),
    staleTime: 30_000,
  });

  return (
    <div
      style={{
        padding: "28px 40px 64px",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBlockEnd: 24 }}>
        <div
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
          {t("kicker")}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            margin: "6px 0 0",
          }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", marginBlockStart: 6 }}>{t("subtitle")}</p>
      </header>

      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBlockEnd: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            htmlFor="rc-date"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-3)",
            }}
          >
            {t("filters.date")}
          </label>
          <input
            id="rc-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: "9px 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--surface-1)",
              fontSize: 14,
              color: "var(--ink-1)",
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            borderRadius: 10,
            background: "var(--surface-1)",
            border: "1px solid var(--line)",
            color: "var(--ink-1)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <Printer size={14} strokeWidth={1.5} />
          {t("print")}
        </button>
      </div>

      {q.isPending ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--ink-3)" }}>
          {t("loading")}
        </div>
      ) : q.isError || !q.data ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--rose)" }}>
          {t("error")}
        </div>
      ) : (
        <>
          <ChainCard totals={q.data.chain_totals} currency={currency} locale={locale} t={t} />
          {q.data.branches.map((b) => (
            <BranchPanel
              key={b.branch_id}
              branch={b}
              currency={currency}
              locale={locale}
              t={t}
            />
          ))}
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

function ChainCard({
  totals,
  currency,
  locale,
  t,
}: {
  totals: ReconcileTotals;
  currency: string;
  locale: "en" | "ar";
  t: ReturnType<typeof useTranslations>;
}) {
  const variance = BigInt(totals.variance_cents);
  return (
    <section
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBlockEnd: 20,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 500,
          margin: "0 0 14px",
        }}
      >
        {t("chain.title")}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        <Stat label={t("totals.gross")} value={fmtMoney(totals.gross_revenue_cents, currency, locale)} />
        <Stat label={t("totals.txns")} value={String(totals.transactions)} />
        <Stat label={t("totals.cashSales")} value={fmtMoney(totals.cash_sales_cents, currency, locale)} />
        <Stat
          label={t("totals.cashRefunds")}
          value={fmtMoney(totals.cash_refunds_cents, currency, locale)}
          tone={BigInt(totals.cash_refunds_cents) > 0n ? "rose" : "muted"}
        />
        <Stat
          label={t("totals.expected")}
          value={fmtMoney(totals.expected_cash_cents, currency, locale)}
        />
        <Stat
          label={t("totals.declared")}
          value={fmtMoney(totals.declared_cash_cents, currency, locale)}
        />
        <Stat
          label={t("totals.variance")}
          value={fmtMoney(totals.variance_cents, currency, locale)}
          tone={variance < 0n ? "rose" : variance > 0n ? "sage" : "muted"}
        />
      </div>
    </section>
  );
}

function BranchPanel({
  branch,
  currency,
  locale,
  t,
}: {
  branch: ReconcileBranch;
  currency: string;
  locale: "en" | "ar";
  t: ReturnType<typeof useTranslations>;
}) {
  const variance = BigInt(branch.totals.variance_cents);
  return (
    <section
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBlockEnd: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBlockEnd: 14,
        }}
      >
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>
            {branch.branch_code} · {branch.name_i18n[locale] || branch.name_i18n.en}
          </h2>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBlockStart: 2 }}>
            {t("branch.shifts", { count: branch.shifts.length })}
          </div>
        </div>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 12,
            background:
              variance === 0n
                ? "color-mix(in oklab, var(--sage, #6e9b7f) 16%, var(--surface-1))"
                : variance < 0n
                  ? "color-mix(in oklab, var(--rose) 14%, var(--surface-1))"
                  : "color-mix(in oklab, var(--amber, #c08a2f) 14%, var(--surface-1))",
            color:
              variance === 0n
                ? "var(--sage, #4d7359)"
                : variance < 0n
                  ? "var(--rose)"
                  : "var(--amber, #8a6418)",
          }}
        >
          {variance === 0n
            ? t("branch.balanced")
            : variance < 0n
              ? t("branch.short", { amount: fmtMoney(branch.totals.variance_cents, currency, locale) })
              : t("branch.over", { amount: fmtMoney(branch.totals.variance_cents, currency, locale) })}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBlockEnd: 16,
        }}
      >
        <Stat label={t("totals.gross")} value={fmtMoney(branch.totals.gross_revenue_cents, currency, locale)} />
        <Stat label={t("totals.txns")} value={String(branch.totals.transactions)} />
        <Stat label={t("totals.cashSales")} value={fmtMoney(branch.totals.cash_sales_cents, currency, locale)} />
        <Stat label={t("totals.cashRefunds")} value={fmtMoney(branch.totals.cash_refunds_cents, currency, locale)} />
        <Stat label={t("totals.expected")} value={fmtMoney(branch.totals.expected_cash_cents, currency, locale)} />
        <Stat label={t("totals.declared")} value={fmtMoney(branch.totals.declared_cash_cents, currency, locale)} />
      </div>

      {branch.totals.by_payment.length > 0 && (
        <div style={{ marginBlockEnd: 12 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-3)",
              marginBlockEnd: 6,
            }}
          >
            {t("branch.byPayment")}
          </div>
          <table style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              {branch.totals.by_payment.map((p) => (
                <tr key={p.method}>
                  <td
                    style={{
                      padding: "4px 0",
                      textTransform: "capitalize",
                      color: "var(--ink-2)",
                    }}
                  >
                    {p.method.replace("_", " ")}
                  </td>
                  <td style={{ padding: "4px 0", textAlign: "end", color: "var(--ink-3)" }}>
                    × {p.count}
                  </td>
                  <td
                    style={{
                      padding: "4px 0",
                      textAlign: "end",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMoney(p.amount_cents, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {branch.shifts.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)", paddingBlockStart: 6 }}>
          {t("branch.noShifts")}
        </div>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-3)",
              }}
            >
              <th style={{ textAlign: "start", padding: "6px 0" }}>{t("shifts.cashier")}</th>
              <th style={{ textAlign: "start", padding: "6px 0" }}>{t("shifts.status")}</th>
              <th style={{ textAlign: "end", padding: "6px 0" }}>{t("shifts.float")}</th>
              <th style={{ textAlign: "end", padding: "6px 0" }}>{t("shifts.expected")}</th>
              <th style={{ textAlign: "end", padding: "6px 0" }}>{t("shifts.declared")}</th>
              <th style={{ textAlign: "end", padding: "6px 0" }}>{t("shifts.variance")}</th>
            </tr>
          </thead>
          <tbody>
            {branch.shifts.map((s) => (
              <tr key={s.id} style={{ borderBlockStart: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 0" }}>{s.cashier_name ?? "—"}</td>
                <td style={{ padding: "6px 0", color: "var(--ink-3)" }}>{s.status}</td>
                <td
                  style={{ padding: "6px 0", textAlign: "end", fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtMoney(s.opening_float_cents, currency, locale)}
                </td>
                <td
                  style={{ padding: "6px 0", textAlign: "end", fontVariantNumeric: "tabular-nums" }}
                >
                  {s.expected_closing_cash_cents
                    ? fmtMoney(s.expected_closing_cash_cents, currency, locale)
                    : "—"}
                </td>
                <td
                  style={{ padding: "6px 0", textAlign: "end", fontVariantNumeric: "tabular-nums" }}
                >
                  {s.declared_closing_cash_cents
                    ? fmtMoney(s.declared_closing_cash_cents, currency, locale)
                    : "—"}
                </td>
                <td
                  style={{
                    padding: "6px 0",
                    textAlign: "end",
                    fontVariantNumeric: "tabular-nums",
                    color: s.variance_cents
                      ? BigInt(s.variance_cents) < 0n
                        ? "var(--rose)"
                        : BigInt(s.variance_cents) > 0n
                          ? "var(--sage, #4d7359)"
                          : "var(--ink-2)"
                      : "var(--ink-3)",
                  }}
                >
                  {s.variance_cents ? fmtMoney(s.variance_cents, currency, locale) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sage" | "rose" | "muted";
}) {
  const color =
    tone === "sage"
      ? "var(--sage, #4d7359)"
      : tone === "rose"
        ? "var(--rose)"
        : "var(--ink-1)";
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color,
          marginBlockStart: 4,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
