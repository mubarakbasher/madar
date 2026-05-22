import { setRequestLocale } from "next-intl/server";
import { EditReturnClient } from "./edit-client";
import "../../returns.css";

export default async function EditReturnPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditReturnClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
