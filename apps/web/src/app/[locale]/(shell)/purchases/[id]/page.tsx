import { setRequestLocale } from "next-intl/server";
import { PODetailClient } from "./detail-client";
import "../purchases.css";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PODetailClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
