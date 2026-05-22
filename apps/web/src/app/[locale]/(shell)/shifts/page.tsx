import { setRequestLocale } from "next-intl/server";
import { ShiftsListClient } from "./shifts-client";
import "./shifts.css";

export default async function ShiftsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShiftsListClient locale={locale === "ar" ? "ar" : "en"} />;
}
