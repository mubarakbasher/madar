"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

export function AddBranchCard({ locale }: { locale: string }) {
  const t = useTranslations("branches");
  return (
    <a className="br-card br-card-add" href={`/${locale}/branches/new`}>
      <div className="br-add-icon">
        <Plus size={22} strokeWidth={1.5} />
      </div>
      <div className="br-add-title">{t("addBranch")}</div>
      <div className="br-add-sub">{t("addBranchHint")}</div>
    </a>
  );
}
