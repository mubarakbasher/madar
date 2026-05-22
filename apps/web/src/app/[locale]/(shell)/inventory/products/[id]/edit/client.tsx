"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/auth/store";
import { productGetRequest } from "@/lib/api/catalog";
import { ProductForm } from "../../../_components/ProductForm";
import { InventorySkeleton } from "../../../_components/InventorySkeleton";

export function EditProductClient({ id }: { id: string }) {
  const t = useTranslations("inventory.form");
  const tenant = useAuthStore((s) => s.tenant);
  const defaultCurrency = tenant?.default_currency_code ?? "EGP";

  const productQ = useQuery({
    queryKey: ["catalog", "product", id],
    queryFn: () => productGetRequest(id),
  });

  if (productQ.isPending) return <InventorySkeleton />;
  if (productQ.isError) {
    return (
      <div style={{ padding: 40, color: "var(--ink-3)", textAlign: "center" }}>
        {t("errors.loadFailed")}
      </div>
    );
  }

  return (
    <ProductForm
      mode="edit"
      product={productQ.data}
      defaultCurrencyCode={defaultCurrency}
    />
  );
}
