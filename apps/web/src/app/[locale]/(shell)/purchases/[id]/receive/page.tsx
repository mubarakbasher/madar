import { setRequestLocale } from "next-intl/server";
import { ReceivePOClient } from "./receive-client";
import "../../purchases.css";

export default async function ReceivePurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ReceivePOClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
