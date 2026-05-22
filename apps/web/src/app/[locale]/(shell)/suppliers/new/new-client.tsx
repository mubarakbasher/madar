"use client";

import { SupplierForm } from "../_components/SupplierForm";

export function NewSupplierClient({ locale }: { locale: string }) {
  return <SupplierForm locale={locale} mode="create" />;
}
