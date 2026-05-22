"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { customerGetRequest } from "@/lib/api/customers";
import { CustomerForm } from "../../_components/CustomerForm";

export function EditCustomerClient({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const q = useQuery({
    queryKey: ["customers", "get", customerId],
    queryFn: () => customerGetRequest(customerId),
  });

  if (q.isPending) {
    return (
      <div className="cu-page">
        <div className="cu-empty">{t("loading")}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="cu-page">
        <div className="cu-empty">
          <div className="cu-empty-title">{t("errorTitle")}</div>
          <p>{t("notFoundBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cu-page">
      <div className="cu-header">
        <div>
          <div className="cu-kicker">{t("kicker")}</div>
          <h1 className="cu-title">{t("editTitle")}</h1>
          <p className="cu-subtitle">{q.data.name}</p>
        </div>
      </div>
      <CustomerForm mode="edit" customer={q.data} />
    </div>
  );
}
