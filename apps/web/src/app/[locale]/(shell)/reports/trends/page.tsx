import { setRequestLocale } from "next-intl/server";
import { TrendsClient } from "./trends-client";

export default async function TrendsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TrendsClient locale={locale === "ar" ? "ar" : "en"} />;
}
