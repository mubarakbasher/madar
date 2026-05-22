import { setRequestLocale } from "next-intl/server";
import { ReportsCenterClient } from "./reports-center-client";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportsCenterClient locale={locale} />;
}
