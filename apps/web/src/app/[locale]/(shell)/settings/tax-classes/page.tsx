import { setRequestLocale } from "next-intl/server";
import { TaxClassesClient } from "./tax-classes-client";

export default async function TaxClassesSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TaxClassesClient locale={locale === "ar" ? "ar" : "en"} />;
}
