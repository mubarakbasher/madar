import { setRequestLocale } from "next-intl/server";
import { StoreCreditClient } from "./store-credit-client";
import "./store-credit.css";

export default async function CustomerStoreCreditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <StoreCreditClient locale={locale === "ar" ? "ar" : "en"} customerId={id} />;
}
