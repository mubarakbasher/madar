import { setRequestLocale } from "next-intl/server";
import { RefundClient } from "./refund-client";
import "./refund.css";

export default async function RefundPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <RefundClient saleId={id} locale={locale === "ar" ? "ar" : "en"} />;
}
