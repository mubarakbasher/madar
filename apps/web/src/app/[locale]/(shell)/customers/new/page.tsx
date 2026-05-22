import { setRequestLocale, getTranslations } from "next-intl/server";
import { CustomerForm } from "../_components/CustomerForm";
import "../customers.css";

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("customers");

  return (
    <div className="cu-page">
      <div className="cu-header">
        <div>
          <div className="cu-kicker">{t("kicker")}</div>
          <h1 className="cu-title">{t("newTitle")}</h1>
          <p className="cu-subtitle">{t("newSubtitle")}</p>
        </div>
      </div>
      <CustomerForm mode="create" />
    </div>
  );
}
