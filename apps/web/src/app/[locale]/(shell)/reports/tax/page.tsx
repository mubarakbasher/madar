import { setRequestLocale } from "next-intl/server";
import { TaxReportClient } from "./tax-client";

export default async function TaxReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TaxReportClient locale={locale === "ar" ? "ar" : "en"} />;
}
