"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { supplierGetRequest } from "@/lib/api/suppliers";
import { SupplierForm } from "../../_components/SupplierForm";

export function EditSupplierClient({ locale, id }: { locale: string; id: string }) {
  const t = useTranslations("suppliers");
  const q = useQuery({
    queryKey: ["suppliers", "detail", id],
    queryFn: () => supplierGetRequest(id),
  });

  if (q.isPending) {
    return (
      <div className="sup sup-form-wrap">
        <div className="sup-skeleton">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="sup sup-form-wrap">
        <div className="sup-error">
          <h2>{t("notFound.title")}</h2>
          <p>{t("notFound.body")}</p>
        </div>
      </div>
    );
  }
  return <SupplierForm locale={locale} mode="edit" initial={q.data} />;
}
