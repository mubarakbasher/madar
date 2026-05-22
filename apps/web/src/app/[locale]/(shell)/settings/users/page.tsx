import { setRequestLocale } from "next-intl/server";
import { UsersClient } from "./users-client";

export default async function UsersSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <UsersClient locale={locale === "ar" ? "ar" : "en"} />;
}
