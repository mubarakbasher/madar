import { setRequestLocale } from "next-intl/server";
import { SalesListClient } from "./sales-client";
import "./sales.css";

export default async function SalesListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SalesListClient locale={locale === "ar" ? "ar" : "en"} />;
}
