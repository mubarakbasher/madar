import { setRequestLocale } from "next-intl/server";
import { ScheduledReportsClient } from "./scheduled-client";

export default async function ScheduledReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ScheduledReportsClient locale={locale === "ar" ? "ar" : "en"} />;
}
