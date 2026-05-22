import { setRequestLocale } from "next-intl/server";
import { DashboardClient } from "./dashboard-client";
import "../../branches.css";

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <DashboardClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
