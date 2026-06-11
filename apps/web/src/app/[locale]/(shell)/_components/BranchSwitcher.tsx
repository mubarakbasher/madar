"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ChevronDown, Globe } from "lucide-react";
import { branchesListRequest } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";
import { useBranchScopeStore } from "@/lib/branch-scope/store";
import { formatNumberShort, minorToMajor } from "@/lib/currency";

export function BranchSwitcher({ locale }: { locale: string }) {
  const t = useTranslations("shell.topbar");
  const [open, setOpen] = useState(false);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const setSelected = useBranchScopeStore((s) => s.setSelected);
  const hydrate = useBranchScopeStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  // Gate on auth bootstrap so the first /v1/branches call carries a fresh
  // Bearer instead of racing AuthBootstrap and burning a wasted 401 round-trip.
  const q = useQuery({
    queryKey: ["branches", "list", "active"],
    queryFn: () => branchesListRequest(),
    enabled: bootstrapped,
    staleTime: 30_000,
  });

  const branches = q.data?.items ?? [];

  // Hide switcher when there's only one (or zero) branch — chain context is moot.
  if (q.isSuccess && branches.length <= 1) return null;

  const selectedBranch =
    selectedBranchId === "all" ? null : branches.find((b) => b.id === selectedBranchId) ?? null;

  const displayName = selectedBranch ? pickName(selectedBranch.name_i18n, locale) : t("allBranches");

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-sm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-sm)",
          padding: "5px 10px",
          fontSize: 12,
          color: "var(--ink-2)",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <MapPin size={13} strokeWidth={1.5} />
        {displayName}
        <ChevronDown size={12} strokeWidth={1.5} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div className="bs-dropdown" role="listbox">
            <button
              type="button"
              className="bs-item"
              aria-current={selectedBranchId === "all"}
              onClick={() => {
                setSelected("all");
                setOpen(false);
              }}
            >
              <Globe size={14} strokeWidth={1.5} />
              <span style={{ flex: 1 }}>{t("allBranches")}</span>
            </button>
            <div style={{ height: 1, background: "var(--rule)", margin: "4px 0" }} />
            {branches.map((b) => {
              const cents = Number(b.today_revenue_cents);
              return (
                <button
                  key={b.id}
                  type="button"
                  className="bs-item"
                  aria-current={selectedBranchId === b.id}
                  onClick={() => {
                    setSelected(b.id);
                    setOpen(false);
                  }}
                >
                  <MapPin size={14} strokeWidth={1.5} />
                  <span style={{ flex: 1 }}>{pickName(b.name_i18n, locale)}</span>
                  <span className="bs-amount">
                    {formatNumberShort(minorToMajor(cents, b.currency_code), locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function pickName(i18n: { en: string; ar: string } | undefined, locale: string): string {
  if (!i18n) return "";
  if (locale === "ar") return i18n.ar || i18n.en;
  return i18n.en || i18n.ar;
}
