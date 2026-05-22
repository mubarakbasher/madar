import { setRequestLocale } from "next-intl/server";
import { ReconcileClient } from "./reconcile-client";

export default async function ReconcilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReconcileClient locale={locale === "ar" ? "ar" : "en"} />;
}
