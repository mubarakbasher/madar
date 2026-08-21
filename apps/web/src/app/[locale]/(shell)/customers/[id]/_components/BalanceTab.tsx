"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { customerReceivablesRequest } from "@/lib/api/customers";
import { useAuthStore } from "@/lib/auth/store";
import { useFormat } from "@/lib/i18n/format";
import { Link } from "../../../../../../../i18n/routing";
import { ReceivePaymentModal } from "./ReceivePaymentModal";

function pickNote(
  note: { en?: string; ar?: string } | null,
  locale: "en" | "ar",
): string {
  if (!note) return "";
  return (locale === "ar" ? note.ar : note.en) ?? note.en ?? note.ar ?? "";
}

export function BalanceTab({
  customerId,
  locale,
}: {
  customerId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("customers.balance");
  const f = useFormat();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canReceive = role === "owner" || role === "manager";

  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["customers", customerId, "receivables"],
    queryFn: () => customerReceivablesRequest(customerId),
  });

  if (q.isPending) {
    return <div className="cu-empty">{t("loading")}</div>;
  }

  if (q.isError) {
    return (
      <div className="cu-form-error">
        <h2 className="cu-section-title">{t("error.title")}</h2>
        <p>{t("error.body")}</p>
        <button type="button" className="cu-btn" onClick={() => q.refetch()}>
          {t("error.retry")}
        </button>
      </div>
    );
  }

  const summary = q.data;
  const hasBalance = summary.balance_minor !== "0" && summary.open_sales.length > 0;

  return (
    <div>
      <div className="cu-balance-card">
        <div>
          <div className="cu-balance-label">{t("outstanding")}</div>
          <div className="cu-balance-value tnum">
            {summary.currency_code
              ? f.money(summary.balance_minor, summary.currency_code)
              : "—"}
          </div>
        </div>
        {canReceive && summary.open_sales.length > 0 && (
          <button
            type="button"
            className="cu-btn cu-btn-primary"
            onClick={() => setModalOpen(true)}
          >
            <CreditCard size={16} strokeWidth={1.5} />
            {t("receivePayment")}
          </button>
        )}
      </div>

      {!hasBalance ? (
        <div className="cu-empty">
          <div className="cu-empty-title">{t("empty.title")}</div>
          <p>{t("empty.body")}</p>
          <Link href="/pos" className="cu-btn" style={{ marginBlockStart: "var(--space-4)" }}>
            {t("empty.cta")}
          </Link>
        </div>
      ) : (
        <>
          <div className="cu-section-head">
            <h2 className="cu-section-title">{t("openSales")}</h2>
          </div>
          <table className="cu-table">
            <thead>
              <tr>
                <th>{t("colCode")}</th>
                <th>{t("colDate")}</th>
                <th>{t("colTotal")}</th>
                <th>{t("colBalanceDue")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.open_sales.map((s) => (
                <tr key={s.sale_id}>
                  <td className="cu-name">{s.code}</td>
                  <td className="cu-muted">{f.date(s.occurred_at)}</td>
                  <td>
                    {summary.currency_code
                      ? f.money(s.total_cents, summary.currency_code)
                      : s.total_cents}
                  </td>
                  <td>
                    {summary.currency_code
                      ? f.money(s.balance_due_cents, summary.currency_code)
                      : s.balance_due_cents}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {summary.ledger.length > 0 && (
        <>
          <div className="cu-section-head">
            <h2 className="cu-section-title">{t("history")}</h2>
          </div>
          <table className="cu-table">
            <thead>
              <tr>
                <th>{t("columns.date")}</th>
                <th>{t("columns.reference")}</th>
                <th>{t("columns.amount")}</th>
                <th>{t("columns.balanceAfter")}</th>
                <th>{t("columns.note")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.ledger.map((row) => {
                const isCredit = !row.amount_minor.startsWith("-");
                return (
                  <tr key={row.id}>
                    <td className="cu-muted">{f.dateTime(row.created_at)}</td>
                    <td className="cu-muted">{row.reference_table}</td>
                    <td className={isCredit ? "cu-balance-positive" : ""}>
                      {summary.currency_code
                        ? f.money(row.amount_minor, summary.currency_code)
                        : row.amount_minor}
                    </td>
                    <td>
                      {summary.currency_code
                        ? f.money(row.balance_after_minor, summary.currency_code)
                        : row.balance_after_minor}
                    </td>
                    <td>{pickNote(row.note_i18n, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {toast && <div className="cu-toast cu-toast-ok">{toast}</div>}

      {modalOpen && (
        <ReceivePaymentModal
          customerId={customerId}
          openSales={summary.open_sales}
          currencyCode={summary.currency_code}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            setToast(t("settledToast"));
            void qc.invalidateQueries({ queryKey: ["customers", customerId, "receivables"] });
            void qc.invalidateQueries({ queryKey: ["customers", "get", customerId] });
            window.setTimeout(() => setToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}
