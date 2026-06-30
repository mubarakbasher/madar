import { setRequestLocale } from "next-intl/server";
import { EditAssetClient } from "./edit-client";
import "../../assets.css";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditAssetClient assetId={id} locale={locale === "ar" ? "ar" : "en"} />;
}
