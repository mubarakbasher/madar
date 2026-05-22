"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { customerStoreCreditRequest } from "@/lib/api/customers";
import { useAuthStore } from "@/lib/auth/store";
import { AdjustCreditModal } from "./_components/AdjustCreditModal";

function pickNote(
  note: { en?: string; ar?: string } | null,
  locale: "en" | "ar",
): string {
  if (!note) return "";
  return (locale === "ar" ? note.ar : note.en) ?? note.en ?? note.ar ?? "";
}

function formatDate(iso: string, locale: "en" | "ar"): string {
  try {
    return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatMinor(value: string): string {
  // Always integer cents on the wire; show signed integer.
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : value;
}

export function StoreCreditClient({
  locale,
  customerId,
}: {
  locale: "en" | "ar";
  customerId: string;
}) {
  const t = useTranslations("customers.storeCredit");
  const tRef = useTranslations("customers.storeCredit.references");
  const tCols = useTranslations("customers.storeCredit.columns");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canMutate = role === "owner" || role === "manager";

  const [modalOpen, setModalOpen] = useState(false);

  const q = useQuery({
    queryKey: ["customers", "store-credit", customerId],
    queryFn: () => customerStoreCreditRequest(customerId),
  });

  if (q.isPending) {
    return (
      <div className="sc">
        <div className="sc-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="sc">
        <div className="sc-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" className="sc-btn" onClick={() => q.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  const summary = q.data;
  const balanceDisplay = formatMinor(summary.balance_minor);

  return (
    <div className="sc">
      <div className="sc-head">
        <div className="sc-head-text">
          <div className="sc-kicker">{t("kicker")}</div>
          <h1 className="sc-title">{t("title")}</h1>
          <p className="sc-subtitle">{t("subtitle")}</p>
        </div>
        {canMutate && (
          <div>
            <button
              type="button"
              className="sc-btn sc-btn-primary"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={14} strokeWidth={1.5} />
              {t("adjustCta")}
            </button>
          </div>
        )}
      </div>

      <div className="sc-balance-card">
        <div>
          <div className="sc-balance-label">{t("balanceLabel")}</div>
          <div className="sc-balance-value tnum">
            {balanceDisplay}
            {summary.currency_code && (
              <span className="sc-balance-currency">{summary.currency_code}</span>
            )}
          </div>
        </div>
      </div>

      <div className="sc-section-head">
        <h2 className="sc-section-title">{t("title")}</h2>
      </div>

      <div className="sc-table-wrap">
        {summary.ledger.length === 0 ? (
          <div className="sc-empty">
            <div className="sc-empty-title">{t("empty.title")}</div>
            <div className="sc-empty-body">{t("empty.body")}</div>
          </div>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>{tCols("date")}</th>
                <th>{tCols("reference")}</th>
                <th>{tCols("amount")}</th>
                <th>{tCols("balanceAfter")}</th>
                <th>{tCols("note")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.ledger.map((row) => {
                const isCredit = !row.amount_minor.startsWith("-");
                return (
                  <tr key={row.id}>
                    <td className="tnum">{formatDate(row.created_at, locale)}</td>
                    <td>
                      <span className="sc-reference-pill">{tRef(row.reference_table)}</span>
                    </td>
                    <td
                      className={`tnum ${
                        isCredit ? "sc-amount-positive" : "sc-amount-negative"
                      }`}
                    >
                      {isCredit ? "+" : ""}
                      {formatMinor(row.amount_minor)}
                    </td>
                    <td className="tnum">{formatMinor(row.balance_after_minor)}</td>
                    <td>{pickNote(row.note_i18n, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <AdjustCreditModal
          customerId={customerId}
          currencyCode={summary.currency_code}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
