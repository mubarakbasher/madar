"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Pencil, TrendingUp } from "lucide-react";
import { branchGetRequest, type ApiBranchDetail } from "@/lib/api/branches";
import { formatCurrency } from "@/lib/currency";
import { OverviewTab } from "../_components/OverviewTab";
import { StaffTab } from "../_components/StaffTab";
import { StockTab } from "../_components/StockTab";
import { SettingsTab } from "../_components/SettingsTab";
import { HoursTab } from "../_components/HoursTab";
import { BankingTab } from "../_components/BankingTab";

type Tab = "overview" | "staff" | "stock" | "hours" | "banking" | "settings";

export function BranchDetailClient({ locale, id }: { locale: "en" | "ar"; id: string }) {
  const t = useTranslations("branches");
  const tD = useTranslations("branches.detail");
  const tPerf = useTranslations("branches.detail.performance");
  const [tab, setTab] = useState<Tab>("overview");

  const q = useQuery({
    queryKey: ["branches", "detail", id],
    queryFn: () => branchGetRequest(id),
  });

  if (q.isPending) {
    return (
      <div className="br">
        <div className="br-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="br">
        <div className="br-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
          <a className="br-btn" href={`/${locale}/branches`}>
            {tD("back")}
          </a>
        </div>
      </div>
    );
  }
  const branch: ApiBranchDetail = q.data;
  const name = locale === "ar" ? branch.name_i18n.ar || branch.name_i18n.en : branch.name_i18n.en;
  const address =
    locale === "ar"
      ? branch.address_i18n?.ar || branch.address_i18n?.en || ""
      : branch.address_i18n?.en || branch.address_i18n?.ar || "";

  return (
    <div className="br">
      <div className="br-detail-head">
        <div>
          <div className="br-kicker">{tD("kicker")}</div>
          <h1 className="br-title">{name}</h1>
          {address ? <p className="br-card-address">{address}</p> : null}
          <div className="br-detail-meta">
            <span>{branch.code}</span>
            <span>·</span>
            <span>
              {formatCurrency(
                Number(branch.today_revenue_cents) / 100,
                branch.currency_code,
                locale,
              )}{" "}
              {t("salesToday").toLowerCase()}
            </span>
            <span>·</span>
            <span>{branch.is_active ? t("statusOpen") : t("statusInactive")}</span>
          </div>
        </div>
        <div className="br-detail-actions">
          <a
            className="br-btn"
            href={`/${locale}/branches/${branch.id}/dashboard`}
            aria-label={tPerf("linkLabel")}
          >
            <TrendingUp size={13} strokeWidth={1.5} /> {tPerf("linkLabel")}
          </a>
          <a className="br-btn" href={`/${locale}/branches/${branch.id}/edit`}>
            <Pencil size={13} strokeWidth={1.5} /> {tD("edit")}
          </a>
        </div>
      </div>

      <div className="br-tabs">
        <button
          type="button"
          className={`br-tab ${tab === "overview" ? "br-tab-active" : ""}`}
          onClick={() => setTab("overview")}
        >
          {tD("tabs.overview")}
        </button>
        <button
          type="button"
          className={`br-tab ${tab === "staff" ? "br-tab-active" : ""}`}
          onClick={() => setTab("staff")}
        >
          {tD("tabs.staff")}
        </button>
        <button
          type="button"
          className={`br-tab ${tab === "stock" ? "br-tab-active" : ""}`}
          onClick={() => setTab("stock")}
        >
          {tD("tabs.stock")}
        </button>
        <button
          type="button"
          className={`br-tab ${tab === "hours" ? "br-tab-active" : ""}`}
          onClick={() => setTab("hours")}
        >
          {tD("tabs.hours")}
        </button>
        <button
          type="button"
          className={`br-tab ${tab === "banking" ? "br-tab-active" : ""}`}
          onClick={() => setTab("banking")}
        >
          {tD("tabs.banking")}
        </button>
        <button
          type="button"
          className={`br-tab ${tab === "settings" ? "br-tab-active" : ""}`}
          onClick={() => setTab("settings")}
        >
          {tD("tabs.settings")}
        </button>
      </div>

      {tab === "overview" && (
        <OverviewTab branch={branch} locale={locale} onViewStaff={() => setTab("staff")} />
      )}
      {tab === "staff" && <StaffTab branch={branch} locale={locale} />}
      {tab === "stock" && <StockTab branchId={branch.id} locale={locale} />}
      {tab === "hours" && <HoursTab branch={branch} />}
      {tab === "banking" && <BankingTab branch={branch} locale={locale} />}
      {tab === "settings" && <SettingsTab branch={branch} locale={locale} />}
    </div>
  );
}
