import { setRequestLocale } from "next-intl/server";
import { EditSupplierClient } from "./edit-client";
import "../../suppliers.css";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditSupplierClient locale={locale} id={id} />;
}
