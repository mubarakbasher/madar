import { setRequestLocale } from "next-intl/server";
import { ReturnDetailClient } from "./detail-client";
import "../returns.css";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ReturnDetailClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
