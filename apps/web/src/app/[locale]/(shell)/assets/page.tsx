import { setRequestLocale } from "next-intl/server";
import { AssetsListClient } from "./assets-list-client";
import "./assets.css";

export default async function AssetsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AssetsListClient locale={locale === "ar" ? "ar" : "en"} />;
}
