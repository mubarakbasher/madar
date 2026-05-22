import { setRequestLocale } from "next-intl/server";
import { EditCustomerClient } from "./edit-client";
import "../../customers.css";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <EditCustomerClient customerId={id} />;
}
