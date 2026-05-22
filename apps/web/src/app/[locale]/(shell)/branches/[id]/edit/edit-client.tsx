"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { branchGetRequest } from "@/lib/api/branches";
import { BranchForm } from "../../_components/BranchForm";

export function EditBranchClient({ locale, id }: { locale: string; id: string }) {
  const t = useTranslations("branches");
  const q = useQuery({
    queryKey: ["branches", "detail", id],
    queryFn: () => branchGetRequest(id),
  });

  if (q.isPending) {
    return (
      <div className="br br-form-wrap">
        <div className="br-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="br br-form-wrap">
        <div className="br-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
        </div>
      </div>
    );
  }
  return <BranchForm locale={locale} mode="edit" initial={q.data} />;
}
