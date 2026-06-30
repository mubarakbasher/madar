"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { assetGetRequest } from "@/lib/api/assets";
import { AssetForm } from "../../_components/AssetForm";

export function EditAssetClient({
  assetId,
  locale,
}: {
  assetId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("assets");
  const q = useQuery({
    queryKey: ["assets", "get", assetId],
    queryFn: () => assetGetRequest(assetId),
  });

  if (q.isPending) {
    return (
      <div className="as-page">
        <div className="as-empty">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="as-page">
        <div className="as-empty">
          <div className="as-empty-title">{t("errorTitle")}</div>
          <p>{t("notFoundBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="as-page">
      <div className="as-header">
        <div>
          <div className="as-kicker">{t("kicker")}</div>
          <h1 className="as-title">{t("editTitle")}</h1>
          <p className="as-subtitle">{q.data.name_i18n[locale] || q.data.name_i18n.en}</p>
        </div>
      </div>
      <AssetForm mode="edit" asset={q.data} locale={locale} />
    </div>
  );
}
