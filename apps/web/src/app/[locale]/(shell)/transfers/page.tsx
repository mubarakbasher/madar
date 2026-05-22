import { setRequestLocale } from "next-intl/server";
import { TransfersClient } from "./transfers-client";

export default async function TransfersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TransfersClient locale={locale === "ar" ? "ar" : "en"} />;
}
