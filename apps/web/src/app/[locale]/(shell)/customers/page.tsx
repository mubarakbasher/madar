import { setRequestLocale } from "next-intl/server";
import { CustomersListClient } from "./customers-list-client";
import "./customers.css";

export default async function CustomersListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CustomersListClient locale={locale === "ar" ? "ar" : "en"} />;
}
