"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Link } from "../../../../../../i18n/routing";
import { shiftGetRequest } from "@/lib/api/shifts";

function fmtMoney(amountMinor: string | null, currency: string, locale: "en" | "ar"): string {
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

export function ShiftDetailClient({ locale, shiftId }: { locale: "en" | "ar"; shiftId: string }) {
  const t = useTranslations("shifts");
  const q = useQuery({
    queryKey: ["shifts", "detail", shiftId],
    queryFn: () => shiftGetRequest(shiftId),
  });

  if (q.isPending) {
    return (
      <div className="sh-page">
        <div className="sh-empty">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="sh-page">
        <div className="sh-empty">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBlockEnd: 8 }}>
            {t("notFoundTitle")}
          </div>
          <p>{t("notFoundBody")}</p>
          <Link href="/shifts" className="cu-btn" style={{ marginBlockStart: 16 }}>
            ← {t("backToList")}
          </Link>
        </div>
      </div>
    );
  }

  const s = q.data;
  const z = s.z_report;
  const variance = s.variance_cents == null ? null : Number(s.variance_cents);
  const varianceClass =
    variance == null ? "" : variance > 0 ? "sh-variance-pos" : variance < 0 ? "sh-variance-neg" : "";

  return (
    <div className="sh-page">
      <header className="sh-header">
        <div className="sh-kicker">{t("detail.kicker")}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="sh-title">{t("detail.title")}</h1>
            <p className="sh-subtitle">
              {s.cashier_name ?? "—"} · {s.branch_code} · {fmtDate(s.opened_at, locale)}
              {s.status === "closed" && <> → {fmtDate(s.closed_at, locale)}</>}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => window.print()}
              className="cu-btn"
              style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
            >
              <Printer size={14} strokeWidth={1.5} />
              {t("detail.print")}
            </button>
          </div>
        </div>
      </header>

      <div className="sh-zr">
        <section>
          <div className="sh-zr-card">
            <div className="sh-zr-label">{t("detail.cashHeader")}</div>
            <div className="sh-zr-row">
              <span>{t("detail.openingFloat")}</span>
              <strong>{fmtMoney(s.opening_float_cents, s.currency_code, locale)}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.cashSales")}</span>
              <strong>{fmtMoney(z.cash_sales_cents, s.currency_code, locale)}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.cashRefunds")}</span>
              <strong>− {fmtMoney(z.cash_refunds_cents, s.currency_code, locale)}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.expectedCash")}</span>
              <strong>{fmtMoney(s.expected_closing_cash_cents, s.currency_code, locale)}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.declaredCash")}</span>
              <strong>{fmtMoney(s.declared_closing_cash_cents, s.currency_code, locale)}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.variance")}</span>
              <strong className={varianceClass}>
                {fmtMoney(s.variance_cents, s.currency_code, locale)}
              </strong>
            </div>
          </div>

          <div className="sh-zr-card" style={{ marginBlockStart: 16 }}>
            <div className="sh-zr-label">{t("detail.byPaymentHeader")}</div>
            {z.by_payment.length === 0 ? (
              <p className="sh-empty" style={{ padding: 16, border: "none" }}>{t("detail.noPayments")}</p>
            ) : (
              z.by_payment.map((p) => (
                <div key={p.method} className="sh-zr-row">
                  <span>{t(`detail.method.${p.method}`, { default: p.method })}</span>
                  <span style={{ display: "inline-flex", gap: 16 }}>
                    <span className="sh-zr-label" style={{ alignSelf: "center" }}>
                      ×{p.count}
                    </span>
                    <strong>{fmtMoney(p.amount_cents, s.currency_code, locale)}</strong>
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="sh-zr-card" style={{ marginBlockStart: 16 }}>
            <div className="sh-zr-label">{t("detail.topProductsHeader")}</div>
            {z.top_products.length === 0 ? (
              <p className="sh-empty" style={{ padding: 16, border: "none" }}>{t("detail.noTopProducts")}</p>
            ) : (
              z.top_products.map((p) => (
                <div key={p.product_id} className="sh-zr-row">
                  <span>
                    <strong>{p.name_i18n[locale] || p.name_i18n.en}</strong>{" "}
                    <span className="sh-zr-label">{p.sku}</span>
                  </span>
                  <span style={{ display: "inline-flex", gap: 16 }}>
                    <span className="sh-zr-label" style={{ alignSelf: "center" }}>
                      ×{p.units}
                    </span>
                    <strong>{fmtMoney(p.revenue_cents, s.currency_code, locale)}</strong>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <aside>
          <div className="sh-zr-card">
            <div className="sh-zr-label">{t("detail.summary")}</div>
            <div className="sh-zr-amount" style={{ marginBlockStart: 8 }}>
              {fmtMoney(z.gross_revenue_cents, s.currency_code, locale)}
            </div>
            <p className="sh-zr-label" style={{ marginBlockStart: 4 }}>
              {t("detail.grossRevenue")}
            </p>
            <div className="sh-zr-row">
              <span>{t("detail.transactions")}</span>
              <strong>{z.transactions}</strong>
            </div>
            <div className="sh-zr-row">
              <span>{t("detail.itemsSold")}</span>
              <strong>{z.items_sold}</strong>
            </div>
          </div>

          {s.notes && (
            <div className="sh-zr-card" style={{ marginBlockStart: 16 }}>
              <div className="sh-zr-label">{t("detail.notes")}</div>
              <p style={{ whiteSpace: "pre-wrap", marginBlockStart: 8 }}>{s.notes}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
