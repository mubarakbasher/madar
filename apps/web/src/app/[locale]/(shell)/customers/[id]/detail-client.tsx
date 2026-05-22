"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { Link, useRouter } from "../../../../../../i18n/routing";
import { useAuthStore } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import {
  customerDeleteRequest,
  customerGetRequest,
  type ApiCustomerDetail,
  type ApiCustomerSale,
} from "@/lib/api/customers";

type Tab = "overview" | "credit" | "sales";

function fmtMoney(
  amountMinor: string | null | undefined,
  currency: string | null | undefined,
  locale: "en" | "ar",
): string {
  if (!amountMinor || !currency) return "—";
  const major = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency,
  }).format(major);
}

function fmtDate(iso: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function CustomerDetailClient({
  locale,
  customerId,
}: {
  locale: "en" | "ar";
  customerId: string;
}) {
  const t = useTranslations("customers");
  const tErr = useTranslations("customers.errors");
  const router = useRouter();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "manager";

  const [tab, setTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["customers", "get", customerId],
    queryFn: () => customerGetRequest(customerId),
  });

  const delM = useMutation({
    mutationFn: () => customerDeleteRequest(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", "list"] });
      router.push("/customers");
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "has_store_credit") setDeleteError(tErr("hasStoreCredit"));
        else if (err.code === "forbidden_during_impersonation")
          setDeleteError(tErr("impersonationForbidden"));
        else setDeleteError(err.message ?? tErr("generic"));
      } else {
        setDeleteError(tErr("network"));
      }
    },
  });

  if (q.isPending) {
    return (
      <div className="cu-page">
        <div className="cu-empty">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="cu-page">
        <div className="cu-empty">
          <div className="cu-empty-title">{t("notFoundTitle")}</div>
          <p>{t("notFoundBody")}</p>
          <Link href="/customers" className="cu-btn" style={{ marginBlockStart: 16 }}>
            ← {t("backToList")}
          </Link>
        </div>
      </div>
    );
  }

  const c = q.data;

  return (
    <div className="cu-page">
      <div className="cu-detail-header">
        <div>
          <div className="cu-kicker">{t("kicker")}</div>
          <h1 className="cu-title">{c.name}</h1>
          <div className="cu-detail-meta">
            {c.code && <span>{c.code}</span>}
            {c.phone && <span>{c.phone}</span>}
            {c.email && <span>{c.email}</span>}
            <span>· {t("memberSince", { date: fmtDate(c.created_at, locale) })}</span>
          </div>
        </div>
        <div className="cu-actions">
          {canEdit && (
            <Link href={`/customers/${customerId}/edit`} className="cu-btn">
              <Pencil size={16} strokeWidth={1.5} />
              {t("edit")}
            </Link>
          )}
          {isOwner && (
            <button
              type="button"
              className="cu-btn cu-btn-danger"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={16} strokeWidth={1.5} />
              {t("deleteCustomer")}
            </button>
          )}
        </div>
      </div>

      <div className="cu-detail-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className="cu-tab"
          onClick={() => setTab("overview")}
        >
          {t("tabs.overview")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "credit"}
          className="cu-tab"
          onClick={() => setTab("credit")}
        >
          {t("tabs.credit")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sales"}
          className="cu-tab"
          onClick={() => setTab("sales")}
        >
          {t("tabs.sales")}
        </button>
      </div>

      {tab === "overview" && <OverviewTab c={c} locale={locale} />}
      {tab === "credit" && <CreditTab c={c} locale={locale} />}
      {tab === "sales" && <SalesTab c={c} locale={locale} />}

      {confirmDelete && (
        <div className="cu-confirm" onClick={() => setConfirmDelete(false)}>
          <div
            className="cu-confirm-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cu-confirm-title">{t("confirmDeleteTitle")}</div>
            <div className="cu-confirm-body">
              {t("confirmDeleteBody", { name: c.name })}
            </div>
            {deleteError && (
              <div className="cu-form-error" style={{ marginBlockEnd: 16 }}>
                {deleteError}
              </div>
            )}
            <div className="cu-confirm-footer">
              <button
                type="button"
                className="cu-btn"
                onClick={() => setConfirmDelete(false)}
                disabled={delM.isPending}
              >
                {t("form.cancel")}
              </button>
              <button
                type="button"
                className="cu-btn cu-btn-danger"
                onClick={() => delM.mutate()}
                disabled={delM.isPending}
              >
                {delM.isPending ? t("deleting") : t("confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ c, locale }: { c: ApiCustomerDetail; locale: "en" | "ar" }) {
  const t = useTranslations("customers");
  return (
    <>
      <div className="cu-grid" style={{ marginBlockEnd: 24 }}>
        <div className="cu-card">
          <div className="cu-card-label">{t("kpi.balance")}</div>
          <div className="cu-card-value">
            {fmtMoney(c.store_credit_balance_minor, c.store_credit_currency_code, locale)}
          </div>
        </div>
        <div className="cu-card">
          <div className="cu-card-label">{t("kpi.salesCount")}</div>
          <div className="cu-card-value">{c.sales_count}</div>
        </div>
        <div className="cu-card">
          <div className="cu-card-label">{t("kpi.lastSale")}</div>
          <div className="cu-card-value" style={{ fontSize: 16, fontFamily: "inherit" }}>
            {c.last_sale_at ? fmtDate(c.last_sale_at, locale) : "—"}
          </div>
        </div>
      </div>

      {c.notes && (
        <div className="cu-card">
          <div className="cu-card-label">{t("notes")}</div>
          <p style={{ marginBlockStart: 8, whiteSpace: "pre-wrap" }}>{c.notes}</p>
        </div>
      )}
    </>
  );
}

function CreditTab({ c, locale }: { c: ApiCustomerDetail; locale: "en" | "ar" }) {
  const t = useTranslations("customers");
  return (
    <div className="cu-card">
      <div className="cu-card-label">{t("credit.balance")}</div>
      <div className="cu-card-value">
        {fmtMoney(c.store_credit_balance_minor, c.store_credit_currency_code, locale)}
      </div>
      <p className="cu-muted" style={{ marginBlockStart: 16 }}>
        {t("credit.body")}
      </p>
      <Link
        href={`/customers/${c.id}/store-credit`}
        className="cu-btn"
        style={{ marginBlockStart: 16 }}
      >
        <Wallet size={16} strokeWidth={1.5} />
        {t("credit.openLedger")}
      </Link>
    </div>
  );
}

function SalesTab({ c, locale }: { c: ApiCustomerDetail; locale: "en" | "ar" }) {
  const t = useTranslations("customers");
  if (c.recent_sales.length === 0) {
    return (
      <div className="cu-empty">
        <div className="cu-empty-title">{t("sales.emptyTitle")}</div>
        <p>{t("sales.emptyBody")}</p>
      </div>
    );
  }
  return (
    <table className="cu-table">
      <thead>
        <tr>
          <th>{t("sales.colCode")}</th>
          <th>{t("sales.colDate")}</th>
          <th>{t("sales.colTotal")}</th>
          <th>{t("sales.colStatus")}</th>
        </tr>
      </thead>
      <tbody>
        {c.recent_sales.map((s: ApiCustomerSale) => (
          <tr key={s.id}>
            <td className="cu-name">{s.code}</td>
            <td className="cu-muted">{fmtDate(s.occurred_at, locale)}</td>
            <td>{fmtMoney(s.total_cents, s.currency_code, locale)}</td>
            <td className="cu-muted">{s.payment_status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
