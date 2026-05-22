import { setRequestLocale } from "next-intl/server";
import { SupplierDetailClient } from "./detail-client";
import "../suppliers.css";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <SupplierDetailClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
