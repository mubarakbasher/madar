import { setRequestLocale } from "next-intl/server";
import { NewReturnClient } from "./new-client";
import "../returns.css";

export default async function NewReturnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewReturnClient locale={locale === "ar" ? "ar" : "en"} />;
}
