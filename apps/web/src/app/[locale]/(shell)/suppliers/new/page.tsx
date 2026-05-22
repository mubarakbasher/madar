import { setRequestLocale } from "next-intl/server";
import { NewSupplierClient } from "./new-client";
import "../suppliers.css";

export default async function NewSupplierPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewSupplierClient locale={locale} />;
}
