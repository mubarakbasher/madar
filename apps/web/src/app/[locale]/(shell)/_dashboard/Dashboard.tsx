"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "../../../../../i18n/routing";
import { useBranchScopeStore } from "@/lib/branch-scope/store";
import { ownerDashboardRequest } from "@/lib/api/dashboard";
import { DashboardClient } from "./DashboardClient";
import "./dashboard.css";

export function Dashboard({ locale }: { locale: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const hydrated = useBranchScopeStore((s) => s.hydrated);
  const hydrate = useBranchScopeStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const isAllScope = selectedBranchId === "all";

  // Redirect to the branch-scoped dashboard when a real branch is picked.
  // `replace` (not `push`) keeps the back-button behavior sane.
  useEffect(() => {
    if (!hydrated) return;
    if (isAllScope) return;
    router.replace(`/branches/${selectedBranchId}/dashboard`);
  }, [hydrated, isAllScope, selectedBranchId, router]);

  const query = useQuery({
    queryKey: ["dashboard", "owner"],
    queryFn: ownerDashboardRequest,
    staleTime: 30_000,
    enabled: hydrated && isAllScope,
  });

  if (!hydrated || query.isPending) {
    return (
      <div className="dash-skeleton" role="status" aria-live="polite">
        <h2>{t("loading.title")}</h2>
        <p>{t("loading.body")}</p>
      </div>
    );
  }
  if (!isAllScope) {
    return (
      <div className="dash-skeleton" role="status" aria-live="polite">
        <h2>{t("redirecting")}</h2>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="dash-error" role="alert">
        <h2>{t("error.title")}</h2>
        <p>{t("error.body")}</p>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          onClick={() => void query.refetch()}
        >
          {t("error.retry")}
        </button>
      </div>
    );
  }

  return (
    <DashboardClient
      data={query.data}
      locale={locale}
      onRetry={() => void query.refetch()}
    />
  );
}
