import { setRequestLocale } from "next-intl/server";
import { BillingClient } from "./billing-client";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BillingClient locale={locale === "ar" ? "ar" : "en"} />;
}
