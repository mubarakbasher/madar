import { setRequestLocale } from "next-intl/server";
import { BranchDetailClient } from "./detail-client";
import "../branches.css";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <BranchDetailClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
