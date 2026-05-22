import { setRequestLocale } from "next-intl/server";
import { BranchesClient } from "./branches-client";

export default async function BranchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BranchesClient locale={locale === "ar" ? "ar" : "en"} />;
}
