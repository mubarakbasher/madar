import { setRequestLocale } from "next-intl/server";
import { AppearanceClient } from "./appearance-client";

export default async function AppearancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppearanceClient />;
}
