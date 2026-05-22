import { setRequestLocale } from "next-intl/server";
import { NewTransferWizard } from "../_components/NewTransferWizard";
import "../transfers.css";

export default async function NewTransferPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewTransferWizard locale={locale === "ar" ? "ar" : "en"} />;
}
