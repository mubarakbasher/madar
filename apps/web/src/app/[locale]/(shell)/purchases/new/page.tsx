import { setRequestLocale } from "next-intl/server";
import { NewPOClient } from "./new-client";
import "../purchases.css";

export default async function NewPurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewPOClient locale={locale === "ar" ? "ar" : "en"} />;
}
