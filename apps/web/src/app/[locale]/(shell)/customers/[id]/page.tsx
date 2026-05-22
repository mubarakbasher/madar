import { setRequestLocale } from "next-intl/server";
import { CustomerDetailClient } from "./detail-client";
import "../customers.css";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CustomerDetailClient locale={locale === "ar" ? "ar" : "en"} customerId={id} />;
}
