import { setRequestLocale } from "next-intl/server";
import { SettingsShell } from "./_components/SettingsShell";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SettingsShell locale={locale}>{children}</SettingsShell>;
}
