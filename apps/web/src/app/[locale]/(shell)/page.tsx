import { setRequestLocale } from "next-intl/server";
import { Dashboard } from "./_dashboard/Dashboard";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Dashboard locale={locale} />;
}
