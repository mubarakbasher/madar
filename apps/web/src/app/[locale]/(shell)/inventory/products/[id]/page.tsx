import { setRequestLocale } from "next-intl/server";
import { ProductDetailClient } from "./detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ProductDetailClient id={id} locale={locale === "ar" ? "ar" : "en"} />;
}
