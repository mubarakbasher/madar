import { setRequestLocale } from "next-intl/server";
import { NewProductClient } from "./client";

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewProductClient />;
}
