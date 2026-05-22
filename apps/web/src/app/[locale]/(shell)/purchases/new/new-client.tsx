"use client";

import { useSearchParams } from "next/navigation";
import { POWizard } from "../_components/POWizard";

/**
 * Wizard entry point. Honors two URL prefill conventions:
 *
 *   - `?supplier_id=<id>` — preselect supplier (from supplier detail page).
 *   - `?prefill=lowstock&branch_id=<id>&supplier_id=<id>` — seed Step 2 with
 *     low-stock products at the branch that are in the supplier's preferred
 *     catalog. The intersection runs inside POWizard once Step 2 mounts.
 */
export function NewPOClient({ locale }: { locale: "en" | "ar" }) {
  const params = useSearchParams();
  const supplierId = params.get("supplier_id") ?? undefined;
  const branchId = params.get("branch_id") ?? undefined;
  const prefillLowStock = params.get("prefill") === "lowstock";

  return (
    <POWizard
      locale={locale}
      mode="create"
      prefillSupplierId={supplierId}
      prefillBranchId={branchId}
      prefillLowStock={prefillLowStock}
    />
  );
}
