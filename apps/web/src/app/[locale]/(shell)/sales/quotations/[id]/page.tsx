import { setRequestLocale } from "next-intl/server";
import { QuotationDetailClient } from "./detail-client";
import "../../sales.css";
import "../quotations.css";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <QuotationDetailClient
      id={id}
      locale={locale === "ar" ? "ar" : "en"}
    />
  );
}
