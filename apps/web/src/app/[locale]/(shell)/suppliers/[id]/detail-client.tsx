"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import {
  supplierDeleteRequest,
  supplierGetRequest,
  type ApiSupplierDetail,
} from "@/lib/api/suppliers";
import { useAuthStore } from "@/lib/auth/store";
import { ReliabilityDial } from "../_components/ReliabilityDial";
import { OverviewTab } from "../_components/OverviewTab";
import { CatalogTab } from "../_components/CatalogTab";
import { OrderHistoryTable } from "../_components/OrderHistoryTable";
import { DocumentsTab } from "../_components/DocumentsTab";
import { ActivityTab } from "../_components/ActivityTab";

type Tab = "overview" | "catalog" | "purchaseOrders" | "documents" | "activity";

function pickName(i18n: { en: string; ar: string }, locale: string): string {
  return locale === "ar" ? i18n.ar || i18n.en : i18n.en || i18n.ar;
}

function computeReliability(stats: ApiSupplierDetail["stats"]): number | null {
  const f = stats.fill_rate_pct;
  const o = stats.on_time_pct;
  if (f === null && o === null) return null;
  if (f === null) return o;
  if (o === null) return f;
  return (f + o) / 2;
}

export function SupplierDetailClient({
  locale,
  id,
}: {
  locale: "en" | "ar";
  id: string;
}) {
  const t = useTranslations("suppliers");
  const tD = useTranslations("suppliers.detail");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    queryKey: ["suppliers", "detail", id],
    queryFn: () => supplierGetRequest(id),
  });

  const del = useMutation({
    mutationFn: () => supplierDeleteRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      window.location.href = `/${locale}/suppliers`;
    },
  });

  if (q.isPending) {
    return (
      <div className="sup">
        <div className="sup-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="sup">
        <div className="sup-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
          <a className="sup-btn" href={`/${locale}/suppliers`}>
            {tD("back")}
          </a>
        </div>
      </div>
    );
  }

  const supplier = q.data;
  const name = pickName(supplier.name_i18n, locale);
  const reliability = computeReliability(supplier.stats);
  const metaBits: string[] = [];
  if (supplier.country_code) metaBits.push(supplier.country_code);
  metaBits.push(supplier.code);
  metaBits.push(supplier.currency_code);
  if (supplier.lead_time_days !== null) {
    metaBits.push(t("card.leadTime", { days: supplier.lead_time_days }));
  }

  return (
    <div className="sup">
      <div className="sup-detail-head">
        <div className="sup-detail-head-left">
          <div className="sup-kicker">{tD("kicker")}</div>
          <h1 className="sup-title">{name}</h1>
          <div className="sup-detail-meta">
            {metaBits.map((bit, i) => (
              <span key={i}>
                {bit}
                {i < metaBits.length - 1 ? " ·" : ""}
              </span>
            ))}
            <span
              className={`sup-pill ${
                supplier.is_active ? "sup-pill-active" : "sup-pill-inactive"
              }`}
            >
              {supplier.is_active ? t("status.active") : t("status.inactive")}
            </span>
          </div>
        </div>
        <div className="sup-detail-head-right">
          <ReliabilityDial pct={reliability} size={64} />
        </div>
      </div>

      <div className="sup-tabs" role="tablist">
        {(["overview", "catalog", "purchaseOrders", "documents", "activity"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`sup-tab ${tab === id ? "sup-tab-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {tD(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          supplier={supplier}
          locale={locale}
          onSwitchToActivity={() => setTab("activity")}
        />
      )}
      {tab === "catalog" && (
        <CatalogTab
          supplierId={supplier.id}
          defaultCurrency={supplier.currency_code}
          locale={locale}
        />
      )}
      {tab === "purchaseOrders" && (
        <OrderHistoryTable supplierId={supplier.id} locale={locale} />
      )}
      {tab === "documents" && <DocumentsTab supplierId={supplier.id} locale={locale} />}
      {tab === "activity" && <ActivityTab supplier={supplier} locale={locale} />}

      {isOwner && (
        <div className="sup-detail-actions">
          <a className="sup-btn" href={`/${locale}/suppliers/${supplier.id}/edit`}>
            <Pencil size={13} strokeWidth={1.5} /> {tD("edit")}
          </a>
          <button
            type="button"
            className="sup-btn sup-btn-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} strokeWidth={1.5} /> {tD("delete")}
          </button>
        </div>
      )}

      {confirmDelete && (
        <div
          className="sup-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(false)}
        >
          <div className="sup-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sup-modal-title">{tD("deleteConfirm.title")}</h3>
            <p className="sup-modal-body">{tD("deleteConfirm.body")}</p>
            <div className="sup-modal-foot">
              <button
                type="button"
                className="sup-btn sup-btn-ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={del.isPending}
              >
                {tD("deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                className="sup-btn sup-btn-danger"
                onClick={() => del.mutate()}
                disabled={del.isPending}
              >
                {del.isPending ? tD("deleteConfirm.deleting") : tD("deleteConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
