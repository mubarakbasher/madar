"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { branchDeleteRequest, type ApiBranchDetail } from "@/lib/api/branches";
import { useAuthStore } from "@/lib/auth/store";

export function SettingsTab({ branch, locale }: { branch: ApiBranchDetail; locale: string }) {
  const t = useTranslations("branches.detail.settings");
  const tForm = useTranslations("branches.form");
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isOwner = role === "owner";
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: () => branchDeleteRequest(branch.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["branches"] });
      window.location.href = `/${locale}/branches`;
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.code === "branch_has_stock") setError(tForm("errors.branch_has_stock"));
        else if (e.code === "branch_has_users") setError(tForm("errors.branch_has_users"));
        else if (e.code === "forbidden_during_impersonation")
          setError(tForm("errors.forbidden_during_impersonation"));
        else setError(e.message);
      } else {
        setError(tForm("errors.deleteFailed"));
      }
    },
  });

  return (
    <section className="br-section">
      <h3 className="br-section-title">{t("title")}</h3>
      <ul className="br-list">
        <li className="br-list-item">
          <span>{t("currency")}</span>
          <span className="br-list-meta">{branch.currency_code}</span>
        </li>
        <li className="br-list-item">
          <span>{t("timezone")}</span>
          <span className="br-list-meta">{branch.timezone}</span>
        </li>
        <li className="br-list-item">
          <span>{t("openedAt")}</span>
          <span className="br-list-meta">{branch.opened_at ?? "—"}</span>
        </li>
      </ul>
      <div className="br-field-hint" style={{ marginBlockStart: 10 }}>
        {t("hoursStub")}
      </div>

      <div style={{ marginBlockStart: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="br-btn" href={`/${locale}/branches/${branch.id}/edit`}>
          {t("editButton")}
        </a>
        {isOwner && (
          <button
            type="button"
            className="br-btn br-btn-danger"
            disabled={del.isPending}
            onClick={() => {
              setError(null);
              if (!confirming) {
                setConfirming(true);
                return;
              }
              del.mutate();
            }}
          >
            {del.isPending ? t("deleting") : confirming ? t("deleteConfirm") : t("deleteBranch")}
          </button>
        )}
      </div>
      {!isOwner && <div className="br-field-hint">{t("deleteHint")}</div>}
      {error && <div className="br-field-error" style={{ marginBlockStart: 10 }}>{error}</div>}
    </section>
  );
}
