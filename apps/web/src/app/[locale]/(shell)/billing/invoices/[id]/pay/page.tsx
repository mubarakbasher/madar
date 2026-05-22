import { setRequestLocale } from "next-intl/server";
import { PayInvoiceClient } from "./pay-client";

export default async function PayInvoicePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PayInvoiceClient invoiceId={id} locale={locale === "ar" ? "ar" : "en"} />;
}
