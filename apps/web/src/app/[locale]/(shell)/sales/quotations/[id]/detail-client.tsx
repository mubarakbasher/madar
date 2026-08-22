"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, XCircle } from "lucide-react";
import {
  quotationDetailRequest,
  quotationCancelRequest,
  type ApiQuotationLine,
} from "@/lib/api/quotations";
import { customerGetRequest } from "@/lib/api/customers";
import { currencyMinorUnits, formatMoney, minorToMajor } from "@/lib/currency";
import { useFormat } from "@/lib/i18n/format";

function fmtMoney(cents: string, currency: string, locale: string): string {
  try {
    return formatMoney(cents, currency, locale);
  } catch {
    return `${currency} ${minorToMajor(cents, currency).toFixed(currencyMinorUnits(currency))}`;
  }
}

function fmtDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function lineName(line: ApiQuotationLine, locale: "en" | "ar"): string {
  return locale === "ar"
    ? line.name_i18n.ar || line.name_i18n.en
    : line.name_i18n.en || line.name_i18n.ar;
}

function pillToken(status: string): string {
  switch (status) {
    case "open":
      return "open";
    case "expired":
      return "expired";
    case "converted":
      return "converted";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

export function QuotationDetailClient({
  id,
  locale,
}: {
  id: string;
  locale: "en" | "ar";
}) {
  const f = useFormat();
  const t = useTranslations("quotationDetail");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ["quotations", "detail", id],
    queryFn: () => quotationDetailRequest(id),
  });

  const customerQ = useQuery({
    queryKey: ["customers", "detail", detailQ.data?.customer_id],
    queryFn: () => customerGetRequest(detailQ.data!.customer_id!),
    enabled: !!detailQ.data?.customer_id,
    staleTime: 60_000,
  });

  const cancelMut = useMutation({
    mutationFn: () => quotationCancelRequest(id),
    onSuccess: () => {
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["quotations", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
  });

  if (detailQ.isPending) {
    return (
      <div className="qt-detail-page">
        <div className="sl-empty">{t("loading")}</div>
      </div>
    );
  }
  if (detailQ.isError || !detailQ.data) {
    return (
      <div className="qt-detail-page">
        <div className="sl-empty" style={{ color: "var(--rose)" }}>
          {t("error")}
        </div>
      </div>
    );
  }

  const q = detailQ.data;
  const status = q.effective_status;
  const currency = q.currency_code;
  const fmt = (cents: string) => fmtMoney(cents, currency, f.locale);

  const printHref = `/${locale}/sales/quotations-print/${id}`;

  return (
    <div className="qt-detail-page">
      <a
        href={`/${locale}/sales/quotations`}
        className="qt-btn"
        style={{ display: "inline-flex", marginBlockEnd: "var(--space-4)" }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
        {t("back")}
      </a>

      <header className="qt-detail-header">
        <div className="qt-detail-top">
          <h1 className="qt-detail-title">{t("title")}</h1>
          <span className={`sl-pill qt-pill-${pillToken(status)}`}>
            {t(`statuses.${status}`)}
          </span>
        </div>
        <div className="qt-detail-code">{q.code}</div>
        <div className="qt-detail-meta">
          <span>
            {t("meta.customer")}:{" "}
            {customerQ.data?.name ?? (q.customer_id ? t("meta.loading") : t("meta.noCustomer"))}
          </span>
          <span>
            {t("meta.validUntil")}: {fmtDate(q.valid_until, f.locale)}
          </span>
          {q.converted_at && (
            <span>
              {t("meta.convertedAt")}: {fmtDate(q.converted_at, f.locale)}
            </span>
          )}
          {q.cancelled_at && (
            <span>
              {t("meta.cancelledAt")}: {fmtDate(q.cancelled_at, f.locale)}
            </span>
          )}
        </div>
        {q.note && <div className="qt-detail-note">{q.note}</div>}
      </header>

      <div className="qt-detail-actions">
        {status === "open" && (
          <>
            <button
              type="button"
              className="qt-btn qt-btn-primary"
              onClick={() => router.push(`/${locale}/pos?quote=${id}`)}
            >
              {t("actions.convert")}
            </button>
            <a href={printHref} className="qt-btn">
              <Printer size={14} strokeWidth={1.5} />
              {t("actions.print")}
            </a>
            <button
              type="button"
              className="qt-btn qt-btn-danger"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle size={14} strokeWidth={1.5} />
              {t("actions.cancel")}
            </button>
          </>
        )}

        {status === "expired" && (
          <>
            <button
              type="button"
              className="qt-btn qt-btn-primary"
              onClick={() => router.push(`/${locale}/pos?quote=${id}&reprice=1`)}
            >
              {t("actions.reprice")}
            </button>
            <a href={printHref} className="qt-btn">
              <Printer size={14} strokeWidth={1.5} />
              {t("actions.print")}
            </a>
            <button
              type="button"
              className="qt-btn qt-btn-danger"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle size={14} strokeWidth={1.5} />
              {t("actions.cancel")}
            </button>
          </>
        )}

        {status === "converted" && (
          <>
            {q.converted_sale_id && (
              <a
                href={`/${locale}/sales/${q.converted_sale_id}/receipt`}
                className="qt-btn qt-btn-primary"
              >
                {t("actions.viewSale")}
              </a>
            )}
            <a href={printHref} className="qt-btn">
              <Printer size={14} strokeWidth={1.5} />
              {t("actions.print")}
            </a>
          </>
        )}

        {status === "cancelled" && (
          <a href={printHref} className="qt-btn">
            <Printer size={14} strokeWidth={1.5} />
            {t("actions.print")}
          </a>
        )}
      </div>

      <table className="sl-table">
        <thead>
          <tr>
            <th>{t("columns.name")}</th>
            <th>{t("columns.sku")}</th>
            <th className="sl-num">{t("columns.qty")}</th>
            <th className="sl-num">{t("columns.unitPrice")}</th>
            <th className="sl-num">{t("columns.discount")}</th>
            <th className="sl-num">{t("columns.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map((line, idx) => {
            const lineTotal =
              BigInt(line.unit_price_cents) * BigInt(Math.round(line.qty)) -
              BigInt(line.discount_cents);
            return (
              <tr key={`${line.product_id}-${idx}`}>
                <td>{lineName(line, locale)}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {line.sku ?? "—"}
                </td>
                <td className="sl-num">{line.qty}</td>
                <td className="sl-num">{fmt(line.unit_price_cents)}</td>
                <td className="sl-num">{fmt(line.discount_cents)}</td>
                <td className="sl-num">{fmt(lineTotal.toString())}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="qt-totals">
        <div className="qt-totals-row">
          <span style={{ color: "var(--ink-3)" }}>{t("totals.subtotal")}</span>
          <span>{fmt(q.subtotal_cents)}</span>
        </div>
        {q.discount_cents !== "0" && (
          <div className="qt-totals-row">
            <span style={{ color: "var(--ink-3)" }}>{t("totals.discount")}</span>
            <span>{fmt(q.discount_cents)}</span>
          </div>
        )}
        {q.tax_cents !== "0" && (
          <div className="qt-totals-row">
            <span style={{ color: "var(--ink-3)" }}>{t("totals.tax")}</span>
            <span>{fmt(q.tax_cents)}</span>
          </div>
        )}
        <div className="qt-totals-row">
          <span>{t("totals.total")}</span>
          <b>{fmt(q.total_cents)}</b>
        </div>
      </div>

      {cancelOpen && (
        <div className="qt-modal-bg" onClick={() => setCancelOpen(false)} role="dialog" aria-modal>
          <div className="qt-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="qt-modal-title">{t("cancelConfirm.title")}</h3>
            <p className="qt-modal-body">{t("cancelConfirm.body")}</p>
            <div className="qt-modal-actions">
              <button
                type="button"
                className="qt-btn"
                onClick={() => setCancelOpen(false)}
                disabled={cancelMut.isPending}
              >
                {t("cancelConfirm.dismiss")}
              </button>
              <button
                type="button"
                className="qt-btn qt-btn-danger"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                {cancelMut.isPending
                  ? t("cancelConfirm.submitting")
                  : t("cancelConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
