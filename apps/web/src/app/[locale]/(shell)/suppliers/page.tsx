import { setRequestLocale } from "next-intl/server";
import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SuppliersClient locale={locale === "ar" ? "ar" : "en"} />;
}
