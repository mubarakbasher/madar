"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CreditCard, FileText, Clock, Sparkles } from "lucide-react";
import { Link } from "../../../../../i18n/routing";
import "./billing.css";
import {
  invoicesListRequest,
  plansListRequest,
  subscriptionRequest,
  type ApiPlan,
  type ApiSubscription,
  type ApiSubscriptionInvoice,
} from "@/lib/api/billing";
import { currencyMinorUnits, minorToMajor } from "@/lib/currency";

type Tab = "plan" | "invoices" | "history";

const INVOICE_TONE: Record<string, { color: string; bg: string; label: string }> = {
  paid: { color: "var(--sage)", bg: "var(--sage-soft, color-mix(in oklab, var(--sage) 14%, transparent))", label: "Paid" },
  awaiting_payment: { color: "var(--amber)", bg: "color-mix(in oklab, var(--amber) 14%, transparent)", label: "Awaiting transfer" },
  in_review: { color: "var(--accent)", bg: "color-mix(in oklab, var(--accent) 14%, transparent)", label: "In review" },
  overdue: { color: "var(--rose)", bg: "color-mix(in oklab, var(--rose) 14%, transparent)", label: "Overdue" },
  draft: { color: "var(--ink-3)", bg: "var(--bg-sunk, transparent)", label: "Draft" },
  cancelled: { color: "var(--ink-3)", bg: "var(--bg-sunk, transparent)", label: "Cancelled" },
};

function formatCents(cents: string, currency: string): string {
  const code = currency || "USD";
  // Compact billing display: no forced trailing zeros, but allow the
  // currency's real precision instead of truncating to whole units.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyMinorUnits(code),
  }).format(minorToMajor(cents, code));
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BillingClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("billing");
  const [tab, setTab] = useState<Tab>("plan");

  const subQ = useQuery({ queryKey: ["billing", "subscription"], queryFn: subscriptionRequest, staleTime: 30_000 });
  const plansQ = useQuery({ queryKey: ["billing", "plans"], queryFn: plansListRequest, staleTime: 5 * 60_000 });
  const invoicesQ = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => invoicesListRequest(),
    staleTime: 30_000,
    enabled: tab !== "plan" || true,
  });

  if (subQ.isPending) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("loading")}</div>;
  }
  if (subQ.isError) {
    return <div style={{ padding: 40, color: "var(--rose)" }}>{t("errors.loadFailed")}</div>;
  }

  const sub = subQ.data;
  const plans = plansQ.data?.items ?? [];
  const invoices = invoicesQ.data?.items ?? [];

  return (
    <div style={{ padding: "var(--space-6) 0", maxWidth: 1080, marginInline: "auto" }}>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <span className="kicker">{t("kicker")}</span>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 36,
            letterSpacing: "-0.02em",
            marginTop: "var(--space-2)",
          }}
        >
          {t("title")}
        </h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14, marginTop: "var(--space-1)" }}>
          {t("subtitle", { tenant: sub.tenant.name })}
        </p>
      </header>

      <nav
        role="tablist"
        style={{
          display: "inline-flex",
          gap: "var(--space-1)",
          padding: "var(--space-1)",
          background: "var(--bg)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-full)",
          marginBottom: "var(--space-5)",
        }}
      >
        {(["plan", "invoices", "history"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: "var(--space-2) 18px",
              borderRadius: "var(--radius-full)",
              background: tab === id ? "var(--accent)" : "transparent",
              color: tab === id ? "white" : "var(--ink-2)",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "plan" && <PlanTab sub={sub} plans={plans} locale={locale} />}
      {tab === "invoices" && <InvoicesTab invoices={invoices} loading={invoicesQ.isPending} />}
      {tab === "history" && <HistoryTab invoices={invoices.filter((i) => i.paid_at)} />}
    </div>
  );
}

function PlanTab({
  sub,
  plans,
  locale,
}: {
  sub: ApiSubscription;
  plans: ApiPlan[];
  locale: "en" | "ar";
}) {
  const t = useTranslations("billing");
  // The (shell) layout redirects no-plan tenants to /onboarding/select-plan,
  // so by the time PlanTab renders, sub.plan is guaranteed to be set. The
  // null check is a TypeScript narrowing — render nothing during the brief
  // flash before the redirect fires, rather than crashing.
  if (!sub.plan) return null;
  const usageLimits = (sub.plan.limits ?? {}) as Record<string, number | string>;
  const trialDaysLeft = sub.tenant.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.tenant.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  const usageRows = [
    {
      key: "transactions",
      label: t("usage.transactions"),
      current: sub.usage.transactions_this_period,
      cap: typeof usageLimits.txns === "number" ? (usageLimits.txns as number) : null,
    },
    {
      key: "users",
      label: t("usage.users"),
      current: sub.usage.users,
      cap: typeof usageLimits.users === "number" ? (usageLimits.users as number) : null,
    },
    {
      key: "branches",
      label: t("usage.branches"),
      current: sub.usage.branches,
      cap: typeof usageLimits.branches === "number" ? (usageLimits.branches as number) : null,
    },
  ];

  return (
    <>
      {sub.tenant.status === "trialing" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) 20px",
            background: "color-mix(in oklab, var(--accent) 12%, transparent)",
            border: "1px solid color-mix(in oklab, var(--accent) 22%, transparent)",
            borderRadius: 12,
            marginBottom: "var(--space-5)",
            fontSize: 14,
          }}
        >
          <Sparkles size={16} strokeWidth={1.5} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span>
            <strong>{t("trial.headline", { days: trialDaysLeft })}</strong> — {t("trial.body")}
          </span>
          {sub.next_invoice && (
            <Link
              href={`/billing/invoices/${sub.next_invoice.id}/pay`}
              style={{
                marginInlineStart: "auto",
                color: "var(--accent)",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {t("trial.cta")} →
            </Link>
          )}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 20,
          marginBottom: "var(--space-6)",
        }}
      >
        <div className="billing-card">
          <span className="kicker">{t("currentPlan.kicker")}</span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, letterSpacing: "-0.01em" }}>
              {sub.plan.name_i18n[locale] || sub.plan.name_i18n.en}
            </h2>
            <span
              style={{
                fontFamily: "var(--serif)",
                fontSize: 28,
                letterSpacing: "-0.02em",
              }}
            >
              {formatCents(sub.plan.monthly_price_cents, sub.plan.currency_code)}
              <small style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-3)" }}>
                {" "}
                / {t("currentPlan.month")}
              </small>
            </span>
          </div>
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {usageRows.map((row) => (
              <UsageBar key={row.key} label={row.label} current={row.current} cap={row.cap} />
            ))}
          </div>
        </div>

        <div className="billing-card">
          <span className="kicker">{t("nextInvoice.kicker")}</span>
          {!sub.next_invoice && (
            <p style={{ marginTop: "var(--space-2)", fontSize: 14, color: "var(--ink-3)" }}>
              {t("nextInvoice.none")}
            </p>
          )}
          {sub.next_invoice && (
            <>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 30,
                  letterSpacing: "-0.02em",
                  marginTop: "var(--space-1)",
                }}
              >
                {formatCents(sub.next_invoice.amount_cents, sub.next_invoice.currency_code)}
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <span
                  style={{
                    color: INVOICE_TONE[sub.next_invoice.status]?.color ?? "var(--ink-3)",
                  }}
                >
                  ● {INVOICE_TONE[sub.next_invoice.status]?.label ?? sub.next_invoice.status}
                </span>
                <span style={{ color: "var(--ink-3)", marginInlineStart: "var(--space-2)" }}>
                  {t("nextInvoice.due", { date: shortDate(sub.next_invoice.due_date) })}
                </span>
              </div>
              <Link
                href={`/billing/invoices/${sub.next_invoice.id}/pay`}
                style={{
                  marginTop: "var(--space-4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px var(--space-4)",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: "var(--radius)",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <CreditCard size={14} strokeWidth={1.5} />
                {t("nextInvoice.payCta")}
              </Link>
            </>
          )}
        </div>
      </section>

      <h2 className="billing-section-title">{t("plans.title")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
        {plans.map((p) => {
          const isCurrent = p.id === sub.plan?.id;
          return (
            <div
              key={p.id}
              className="billing-card"
              style={{
                border: isCurrent ? "2px solid var(--accent)" : "1px solid var(--rule)",
              }}
            >
              <span className="kicker">
                {p.name_i18n[locale] || p.name_i18n.en} {isCurrent && `· ${t("plans.current")}`}
              </span>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 26,
                  letterSpacing: "-0.02em",
                  marginTop: "var(--space-1)",
                }}
              >
                {formatCents(p.monthly_price_cents, p.currency_code)}
                <small style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-3)" }}>
                  /{t("currentPlan.month")}
                </small>
              </div>
              <ul style={{ marginTop: "var(--space-3)", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7, paddingInlineStart: "var(--space-4)" }}>
                {Object.entries(p.limits as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                  <li key={k}>
                    <strong>{String(v)}</strong> {k.replace("_", " ")}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

function UsageBar({ label, current, cap }: { label: string; current: number; cap: number | null }) {
  const pct = cap ? Math.min(100, Math.round((current / cap) * 100)) : 0;
  const warn = pct >= 90;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", marginBottom: "var(--space-1)" }}>
        <span>{label}</span>
        <span>
          <strong>{current.toLocaleString()}</strong>
          {cap ? ` / ${cap.toLocaleString()}` : ""}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--rule)" }}>
        <div
          style={{
            height: "100%",
            width: cap ? `${pct}%` : "0%",
            background: warn ? "var(--amber)" : "var(--accent)",
            borderRadius: "var(--radius-full)",
            transition: "width 240ms ease",
          }}
        />
      </div>
    </div>
  );
}

function InvoicesTab({ invoices, loading }: { invoices: ApiSubscriptionInvoice[]; loading: boolean }) {
  const t = useTranslations("billing");
  if (loading) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("loading")}</div>;
  }
  if (invoices.length === 0) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("invoices.empty")}</div>;
  }

  return (
    <table className="billing-table">
      <thead>
        <tr>
          <th>{t("invoices.col.ref")}</th>
          <th>{t("invoices.col.period")}</th>
          <th>{t("invoices.col.due")}</th>
          <th style={{ textAlign: "end" }}>{t("invoices.col.amount")}</th>
          <th>{t("invoices.col.status")}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => {
          const tone = INVOICE_TONE[inv.status];
          return (
            <tr key={inv.id}>
              <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{inv.reference_code}</td>
              <td>
                {inv.period_start} → {inv.period_end}
              </td>
              <td>{inv.due_date}</td>
              <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                {formatCents(inv.amount_cents, inv.currency_code)}
              </td>
              <td>
                <span
                  style={{
                    color: tone?.color ?? "var(--ink-3)",
                    background: tone?.bg ?? "transparent",
                    padding: "2px 10px",
                    borderRadius: "var(--radius-full)",
                    fontSize: 11,
                  }}
                >
                  {tone?.label ?? inv.status}
                </span>
              </td>
              <td style={{ textAlign: "end" }}>
                {(inv.status === "awaiting_payment" || inv.status === "overdue") && (
                  <Link
                    href={`/billing/invoices/${inv.id}/pay`}
                    style={{
                      color: "var(--accent)",
                      fontWeight: 500,
                      textDecoration: "none",
                      fontSize: 13,
                    }}
                  >
                    {t("invoices.payCta")} →
                  </Link>
                )}
                {inv.status === "in_review" && (
                  <Link
                    href={`/billing/invoices/${inv.id}/pay`}
                    style={{ color: "var(--ink-3)", fontSize: 12, textDecoration: "underline" }}
                  >
                    {t("invoices.viewStatus")}
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryTab({ invoices }: { invoices: ApiSubscriptionInvoice[] }) {
  const t = useTranslations("billing");
  const lifetimeCents = invoices.reduce(
    (sum, inv) => sum + Number(BigInt(inv.amount_cents)),
    0,
  );
  const currency = invoices[0]?.currency_code ?? "USD";

  return (
    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: "var(--space-5)" }}>
      <div>
        <h2 className="billing-section-title">{t("history.timeline")}</h2>
        {invoices.length === 0 && (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>{t("history.empty")}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "var(--space-3) var(--space-4)",
                background: "var(--surface)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
              }}
            >
              <Clock size={16} strokeWidth={1.5} style={{ color: "var(--sage)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {t("history.paid")} {inv.reference_code}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {shortDate(inv.paid_at)} · {inv.period_start} → {inv.period_end}
                </div>
              </div>
              <span
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 18,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCents(inv.amount_cents, inv.currency_code)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <aside>
        <div className="billing-card">
          <span className="kicker">{t("history.lifetime")}</span>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 32,
              letterSpacing: "-0.02em",
              marginTop: "var(--space-1)",
            }}
          >
            {formatCents(String(lifetimeCents), currency)}
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            {t("history.acrossPayments", { count: invoices.length })}
          </p>
        </div>
        <div className="billing-card" style={{ marginTop: "var(--space-4)" }}>
          <FileText size={16} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            {t("history.receiptsNote")}
          </p>
        </div>
      </aside>
    </section>
  );
}
