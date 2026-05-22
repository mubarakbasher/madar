import { setRequestLocale } from "next-intl/server";
import { TransferDetailClient } from "./detail-client";
import "../transfers.css";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <TransferDetailClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
