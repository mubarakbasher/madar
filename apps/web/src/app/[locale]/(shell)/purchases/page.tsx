import { setRequestLocale } from "next-intl/server";
import { PurchasesClient } from "./purchases-client";

export default async function PurchasesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PurchasesClient locale={locale === "ar" ? "ar" : "en"} />;
}
