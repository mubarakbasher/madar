import { setRequestLocale } from "next-intl/server";
import { MovementsClient } from "./movements-client";
import "./movements.css";

export default async function MovementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MovementsClient locale={locale === "ar" ? "ar" : "en"} />;
}
