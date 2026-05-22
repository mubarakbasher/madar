import { setRequestLocale } from "next-intl/server";
import { BusinessClient } from "./business-client";
import "./business.css";

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BusinessClient locale={locale === "ar" ? "ar" : "en"} />;
}
