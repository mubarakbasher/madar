"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "../../../../../i18n/routing";
import { shiftCurrentRequest, type ApiShiftDetail } from "@/lib/api/shifts";
import { OpenShiftModal } from "./OpenShiftModal";
import { EndShiftModal } from "./EndShiftModal";

/**
 * Gates the POS sell screen behind an open cashier shift. When no current
 * shift exists for the logged-in cashier, the open-shift modal is shown and
 * the POS is hidden. While a shift IS open, exposes a child render-prop
 * carrying the shift summary so the POS header can show the chip and an
 * "End shift" button.
 *
 * Skipped (returns children directly) when no branchId is available —
 * preserves the existing flow for users not bound to a single branch.
 */
export function ShiftGate({
  branchId,
  currency,
  children,
}: {
  branchId: string | null;
  currency: string;
  children: (state: {
    currentShiftId: string | null;
    openingFloatCents: string | null;
    openedAt: string | null;
    onEndShift: () => void;
  }) => React.ReactNode;
}) {
  const t = useTranslations("pos.shift");
  const router = useRouter();
  const [endingShift, setEndingShift] = useState(false);

  const q = useQuery({
    queryKey: ["shifts", "current"],
    queryFn: shiftCurrentRequest,
    // null when no open shift — that's not an error. apiFetch returns the
    // body verbatim; the controller returns null for the empty case.
    enabled: !!branchId,
    staleTime: 30_000,
  });

  if (!branchId) {
    // Cashier has no branch — let the POS render so the existing "no branch"
    // error path can surface. The shift gate is only meaningful with a branch.
    return (
      <>
        {children({
          currentShiftId: null,
          openingFloatCents: null,
          openedAt: null,
          onEndShift: () => undefined,
        })}
      </>
    );
  }

  if (q.isPending) {
    return (
      <div className="pos">
        <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("loading")}</div>
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="pos">
        <div style={{ padding: 40, color: "var(--ink-3)" }}>{t("openRequired")}</div>
        <OpenShiftModal
          branchId={branchId}
          currency={currency}
          onOpened={() => q.refetch()}
        />
      </div>
    );
  }

  const shift = q.data;

  return (
    <>
      {children({
        currentShiftId: shift.id,
        openingFloatCents: shift.opening_float_cents,
        openedAt: shift.opened_at,
        onEndShift: () => setEndingShift(true),
      })}
      {endingShift && (
        <EndShiftModal
          shiftId={shift.id}
          currency={currency}
          onCancel={() => setEndingShift(false)}
          onClosed={(z: ApiShiftDetail) => {
            setEndingShift(false);
            router.push(`/shifts/${z.id}`);
          }}
        />
      )}
    </>
  );
}
