import { setRequestLocale } from "next-intl/server";
import { ReorderClient } from "./reorder-client";
import "./reorder.css";

export default async function ReorderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReorderClient locale={locale === "ar" ? "ar" : "en"} />;
}
