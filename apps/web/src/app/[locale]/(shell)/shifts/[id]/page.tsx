import { setRequestLocale } from "next-intl/server";
import { ShiftDetailClient } from "./detail-client";
import "../shifts.css";

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ShiftDetailClient locale={locale === "ar" ? "ar" : "en"} shiftId={id} />;
}
