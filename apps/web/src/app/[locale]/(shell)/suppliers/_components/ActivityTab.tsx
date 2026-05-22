"use client";

import { useTranslations } from "next-intl";
import { Activity, Receipt } from "lucide-react";
import type { ApiSupplierActivity, ApiSupplierDetail } from "@/lib/api/suppliers";
import { formatCurrency } from "@/lib/currency";

function formatRelative(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", { numeric: "auto" });
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

function humanAction(action: string | null | undefined): string {
  if (!action) return "—";
  return action.replace(/_/g, " ");
}

export function ActivityTab({
  supplier,
  locale,
}: {
  supplier: ApiSupplierDetail;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers.activity");
  const items = supplier.recent_activity;

  return (
    <section className="sup-section">
      <div className="sup-section-head">
        <h3 className="sup-section-title">{t("title")}</h3>
      </div>

      {items.length === 0 ? (
        <div className="sup-section-empty">{t("empty")}</div>
      ) : (
        <ul className="sup-activity">
          {items.map((row) => (
            <ActivityRow key={`${row.kind}-${row.id}`} row={row} locale={locale} supplierCurrency={supplier.currency_code} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({
  row,
  locale,
  supplierCurrency,
}: {
  row: ApiSupplierActivity;
  locale: "en" | "ar";
  supplierCurrency: string;
}) {
  const t = useTranslations("suppliers.activity");
  const when = formatRelative(row.occurred_at, locale);

  if (row.kind === "po") {
    const total = row.total_cents ? Number(row.total_cents) : null;
    const status = row.status ?? "";
    return (
      <li className="sup-activity-row">
        <div className="sup-activity-icon">
          <Receipt size={14} strokeWidth={1.5} />
        </div>
        <div className="sup-activity-body">
          <a className="sup-table-link" href={`/${locale}/purchases/${row.id}`}>
            <span className="sup-activity-title">
              {t("po", { code: row.code ?? row.id.slice(0, 8) })}
            </span>
          </a>
          <div className="sup-activity-meta">
            {status} · {when}
          </div>
        </div>
        {total !== null && (
          <div className="sup-activity-amount">
            {formatCurrency(total / 100, supplierCurrency, locale)}
          </div>
        )}
      </li>
    );
  }

  // audit
  return (
    <li className="sup-activity-row">
      <div className="sup-activity-icon">
        <Activity size={14} strokeWidth={1.5} />
      </div>
      <div className="sup-activity-body">
        <span className="sup-activity-title">
          {t("audit", { action: humanAction(row.action) })}
        </span>
        <div className="sup-activity-meta">{when}</div>
      </div>
    </li>
  );
}
