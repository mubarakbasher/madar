import { setRequestLocale } from "next-intl/server";
import { MoversClient } from "./movers-client";

export default async function MoversReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MoversClient locale={locale === "ar" ? "ar" : "en"} />;
}
