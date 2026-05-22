import { setRequestLocale } from "next-intl/server";
import { EditProductClient } from "./client";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditProductClient id={id} />;
}
