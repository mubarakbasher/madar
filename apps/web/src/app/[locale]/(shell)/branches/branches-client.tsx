"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { List, Map as MapIcon } from "lucide-react";
import { branchesListRequest } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";
import { BranchCard } from "./_components/BranchCard";
import { AddBranchCard } from "./_components/AddBranchCard";
import { BranchMapView } from "./_components/BranchMapView";
import "./branches.css";

type ViewMode = "list" | "map";

export function BranchesClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("branches");
  const tMap = useTranslations("branches.detail.map");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isOwner = role === "owner";
  const [view, setView] = useState<ViewMode>("list");

  const q = useQuery({
    queryKey: ["branches", "list", "include-inactive"],
    queryFn: () => branchesListRequest({ include_inactive: true }),
    staleTime: 30_000,
  });

  if (q.isPending) {
    return (
      <div className="br">
        <header className="br-head">
          <div className="br-kicker">{t("kicker")}</div>
          <h1 className="br-title">{t("title")}</h1>
        </header>
        <div className="br-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="br">
        <header className="br-head">
          <div className="br-kicker">{t("kicker")}</div>
          <h1 className="br-title">{t("title")}</h1>
        </header>
        <div className="br-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" onClick={() => void q.refetch()} className="br-btn br-btn-primary">
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  const branches = q.data.items;

  return (
    <div className="br">
      <header className="br-head">
        <div className="br-kicker">{t("kicker")}</div>
        <h1 className="br-title">{t("title")}</h1>
        <p className="br-subtitle">{t("subtitle")}</p>
      </header>

      {branches.length === 0 ? (
        <div className="br-empty">
          <h2 className="br-empty-title">{t("empty.title")}</h2>
          <p className="br-empty-body">{t("empty.body")}</p>
          {isOwner && (
            <a className="br-btn br-btn-primary" href={`/${locale}/branches/new`}>
              {t("empty.cta")}
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="br-view-toggle">
            <button
              type="button"
              className={view === "list" ? "br-view-toggle-active" : ""}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              <List size={13} strokeWidth={1.5} /> {tMap("listView")}
            </button>
            <button
              type="button"
              className={view === "map" ? "br-view-toggle-active" : ""}
              onClick={() => setView("map")}
              aria-pressed={view === "map"}
            >
              <MapIcon size={13} strokeWidth={1.5} /> {tMap("mapView")}
            </button>
          </div>

          {view === "list" ? (
            <div className="br-grid">
              {branches.map((b) => (
                <BranchCard key={b.id} branch={b} locale={locale} />
              ))}
              {isOwner && <AddBranchCard locale={locale} />}
            </div>
          ) : (
            <BranchMapView branches={branches} locale={locale} />
          )}
        </>
      )}
    </div>
  );
}
