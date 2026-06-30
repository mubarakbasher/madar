import { setRequestLocale, getTranslations } from "next-intl/server";
import { AssetForm } from "../_components/AssetForm";
import "../assets.css";

export default async function NewAssetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("assets");

  return (
    <div className="as-page">
      <div className="as-header">
        <div>
          <div className="as-kicker">{t("kicker")}</div>
          <h1 className="as-title">{t("newTitle")}</h1>
          <p className="as-subtitle">{t("newSubtitle")}</p>
        </div>
      </div>
      <AssetForm mode="create" locale={locale === "ar" ? "ar" : "en"} />
    </div>
  );
}
