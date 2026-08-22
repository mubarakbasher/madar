import { setRequestLocale } from "next-intl/server";
import { QuotationsListClient } from "./quotations-client";
import "../sales.css";
import "./quotations.css";

export default async function QuotationsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <QuotationsListClient locale={locale === "ar" ? "ar" : "en"} />;
}
