"use client";

import { useAuthStore } from "@/lib/auth/store";
import { ProductForm } from "../../_components/ProductForm";

export function NewProductClient() {
  const tenant = useAuthStore((s) => s.tenant);
  const defaultCurrency = tenant?.default_currency_code ?? "EGP";
  return <ProductForm mode="create" defaultCurrencyCode={defaultCurrency} />;
}
