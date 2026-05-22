import { setRequestLocale } from "next-intl/server";
import { SecurityClient } from "./security-client";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SecurityClient locale={locale} />;
}
