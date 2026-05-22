"use client";

import { useTranslations } from "next-intl";
import { Pencil, Package, Users } from "lucide-react";
import type { ApiBranchSummary } from "@/lib/api/branches";
import { formatCurrency } from "@/lib/currency";

function pickName(i18n: { en: string; ar: string } | undefined, locale: string): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function pickAddress(i18n: { en?: string; ar?: string } | null, locale: string): string {
  if (!i18n) return "";
  return locale === "ar" ? i18n.ar ?? i18n.en ?? "" : i18n.en ?? i18n.ar ?? "";
}

export function BranchCard({
  branch,
  locale,
}: {
  branch: ApiBranchSummary;
  locale: string;
}) {
  const t = useTranslations("branches");
  const cents = Number(branch.today_revenue_cents);
  const name = pickName(branch.name_i18n, locale);
  const address = pickAddress(branch.address_i18n, locale);
  const status = !branch.is_active
    ? { label: t("statusInactive"), tone: "inactive" as const }
    : { label: t("statusOpen"), tone: "open" as const };

  return (
    <a className="br-card" href={`/${locale}/branches/${branch.id}`}>
      <div className="br-card-head">
        <div className="br-card-name-block">
          <h3 className="br-card-name">{name}</h3>
          {address ? <p className="br-card-address">{address}</p> : null}
        </div>
        <span className={`br-pill br-pill-${status.tone}`}>{status.label}</span>
      </div>

      <div className="br-card-stats">
        <div className="br-stat">
          <div className="br-stat-label">{t("salesToday")}</div>
          <div className="br-stat-value">
            {formatCurrency(cents / 100, branch.currency_code, locale)}
          </div>
        </div>
        <div className="br-stat">
          <div className="br-stat-label">
            <Package size={12} strokeWidth={1.5} />
            <span className="br-stat-mini">{t("quick.stock")}</span>
          </div>
          <div className="br-stat-value-sm">{branch.product_count}</div>
        </div>
        <div className="br-stat">
          <div className="br-stat-label">
            <Users size={12} strokeWidth={1.5} />
            <span className="br-stat-mini">{t("quick.staff")}</span>
          </div>
          <div className="br-stat-value-sm">{branch.staff_count}</div>
        </div>
      </div>

      <div className="br-card-foot">
        <span className="br-card-code">{branch.code}</span>
        <span
          className="br-card-edit"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `/${locale}/branches/${branch.id}/edit`;
          }}
        >
          <Pencil size={12} strokeWidth={1.5} /> {t("quick.edit")}
        </span>
      </div>
    </a>
  );
}
