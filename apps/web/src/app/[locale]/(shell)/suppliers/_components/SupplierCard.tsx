"use client";

import { useTranslations } from "next-intl";
import type { ApiSupplierSummary } from "@/lib/api/suppliers";
import { formatCurrency } from "@/lib/currency";
import { ReliabilityDial } from "./ReliabilityDial";

function pickName(
  i18n: { en: string; ar: string } | null | undefined,
  locale: string,
  fallback: string,
): string {
  if (!i18n) return fallback;
  return locale === "ar" ? i18n.ar || i18n.en || fallback : i18n.en || i18n.ar || fallback;
}

function formatLastOrder(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return rtf.format(-Math.max(1, Math.floor(diffMs / 3600_000)), "hour");
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

export function SupplierCard({
  supplier,
  locale,
}: {
  supplier: ApiSupplierSummary;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers");
  // List rows don't carry stats — show a placeholder dial (null tier).
  // Real reliability is on the detail page.
  const name = pickName(supplier.name_i18n, locale, supplier.code);
  const owed = Number(supplier.owed_cents);
  const owedFormatted = formatCurrency(owed / 100, supplier.currency_code, locale);
  const lastOrder = formatLastOrder(supplier.last_order_at, locale);
  const isHighOwed = owed > 1_000_000; // 10k major units

  const metaBits: string[] = [];
  if (supplier.country_code) metaBits.push(supplier.country_code);
  if (supplier.lead_time_days !== null) {
    metaBits.push(t("card.leadTime", { days: supplier.lead_time_days }));
  }
  if (supplier.payment_terms) metaBits.push(supplier.payment_terms);

  return (
    <a className="sup-card" href={`/${locale}/suppliers/${supplier.id}`}>
      <div className="sup-card-head">
        <div>
          <h3 className="sup-card-name">{name}</h3>
          {metaBits.length > 0 && <div className="sup-card-meta">{metaBits.join(" · ")}</div>}
        </div>
        <ReliabilityDial pct={null} size={50} />
      </div>

      {supplier.contact_email || supplier.contact_phone ? (
        <p className="sup-card-body">
          {supplier.contact_email ?? ""}
          {supplier.contact_email && supplier.contact_phone ? " · " : ""}
          {supplier.contact_phone ?? ""}
        </p>
      ) : (
        <p className="sup-card-body">&nbsp;</p>
      )}

      <div className="sup-card-stats">
        <div>
          <div className="sup-card-stat-label">{t("card.lastOrder")}</div>
          <div className="sup-card-stat-value">{lastOrder}</div>
        </div>
        <div>
          <div className="sup-card-stat-label">{t("card.owed")}</div>
          <div
            className={`sup-card-stat-value-lg${isHighOwed ? " sup-card-stat-value-warn" : ""}`}
          >
            {owedFormatted}
          </div>
        </div>
      </div>

      <div className="sup-card-foot">
        <span className="sup-card-code">{supplier.code}</span>
        <span
          className={`sup-card-pill ${
            supplier.is_active ? "sup-card-pill-active" : "sup-card-pill-inactive"
          }`}
        >
          {supplier.is_active ? t("status.active") : t("status.inactive")}
        </span>
      </div>
    </a>
  );
}
