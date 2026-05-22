import { setRequestLocale } from "next-intl/server";
import { EditPOClient } from "./edit-client";
import "../../purchases.css";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditPOClient locale={locale === "ar" ? "ar" : "en"} id={id} />;
}
