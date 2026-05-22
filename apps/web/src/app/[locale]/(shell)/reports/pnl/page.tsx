import { setRequestLocale } from "next-intl/server";
import { PnlClient } from "./pnl-client";

export default async function PnlReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PnlClient locale={locale} />;
}
