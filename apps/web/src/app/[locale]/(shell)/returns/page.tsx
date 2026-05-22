import { setRequestLocale } from "next-intl/server";
import { ReturnsClient } from "./returns-client";

export default async function ReturnsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReturnsClient locale={locale === "ar" ? "ar" : "en"} />;
}
