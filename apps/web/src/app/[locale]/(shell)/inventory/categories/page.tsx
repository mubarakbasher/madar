import { setRequestLocale } from "next-intl/server";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CategoriesClient locale={locale === "ar" ? "ar" : "en"} />;
}
