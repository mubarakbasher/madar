"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Printer, Undo2, Banknote } from "lucide-react";
import { receiptDataRequest, type ReceiptResponse } from "@/lib/api/sales";
import { useAuthStore } from "@/lib/auth/store";
import {
  findPairedPrinter,
  pairPrinter,
  popDrawer,
} from "@/lib/hardware/cash-drawer";
import { ReceiptView } from "../../_components/ReceiptView";
import "./receipt.css";

const REFUND_ROLES = new Set(["owner", "manager", "cashier", "accountant"]);

type Size = "58mm" | "80mm" | "a4";
const SIZES: Size[] = ["58mm", "80mm", "a4"];

export function ReceiptDoc({
  id,
  locale,
  size,
}: {
  id: string;
  locale: "en" | "ar";
  size: Size;
}) {
  const t = useTranslations("receipt");
  const role = useAuthStore((s) => s.user?.role ?? "");
  const q = useQuery({
    queryKey: ["sale", "receipt", id],
    queryFn: () => receiptDataRequest(id),
  });

  // WebUSB cash-drawer (Slice 3). State machine: undetermined → ready (paired
  // device found on mount) | pair (no paired device yet) | unsupported
  // (no navigator.usb). We auto-pop on cash sales when paired; the user can
  // also click manually.
  type DrawerUiState = "checking" | "unsupported" | "needs_pairing" | "ready" | "kicking" | "kicked" | "error";
  const [drawer, setDrawer] = useState<DrawerUiState>("checking");
  const autoPopFired = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("usb" in navigator)) {
      setDrawer("unsupported");
      return;
    }
    let cancelled = false;
    findPairedPrinter().then((d) => {
      if (cancelled) return;
      setDrawer(d ? "ready" : "needs_pairing");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerKick = async (): Promise<void> => {
    setDrawer("kicking");
    try {
      await popDrawer();
      setDrawer("kicked");
      setTimeout(() => setDrawer("ready"), 1500);
    } catch (err) {
      const code = err instanceof Error ? err.message : "usb_error";
      if (code === "no_printer") setDrawer("needs_pairing");
      else setDrawer("error");
    }
  };

  const pairAndKick = async (): Promise<void> => {
    try {
      await pairPrinter();
      await triggerKick();
    } catch {
      // User cancelled the picker — silently revert.
      setDrawer("needs_pairing");
    }
  };

  // Detect cash receipt without an early return so the effect below is
  // unconditional (React rules of hooks — every render must call the same
  // hooks in the same order).
  const saleFromQuery = q.data?.sale;
  const isCashReceipt = saleFromQuery
    ? saleFromQuery.payment_method === "cash" ||
      (saleFromQuery.payments ?? []).some((p) => p.method === "cash")
    : false;

  // Auto-pop the drawer once per receipt mount when (a) a paired printer is
  // detected and (b) this is a cash receipt. Cashier didn't have to click —
  // matches the printer-DIP-switch UX, but in software.
  useEffect(() => {
    if (!isCashReceipt) return;
    if (drawer !== "ready") return;
    if (autoPopFired.current) return;
    autoPopFired.current = true;
    void triggerKick();
    // triggerKick is defined inside the component but stable per-render; the
    // dependency array is intentionally minimal so the effect fires at most
    // once per ready-state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCashReceipt, drawer]);

  if (q.isPending) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--ink-3)" }}>{t("loading")}</p>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="receipt-shell">
        <p style={{ color: "var(--rose)" }}>{t("errors.loadFailed")}</p>
      </div>
    );
  }

  const data: ReceiptResponse = q.data;

  return (
    <div className="receipt-shell">
      <ReceiptView doc={data} locale={locale} size={size} variant="receipt" />

      <div className="no-print">
        <a href={`/${locale}/pos`} className="receipt-back-link">
          {t("buttons.backToPos")}
        </a>
        <button type="button" onClick={() => window.print()}>
          <Printer size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
          {t("buttons.print")}
        </button>
        {data.sale.payment_status === "paid" && REFUND_ROLES.has(role) && (
          <a href={`/${locale}/sales/${id}/refund`} className="receipt-refund-link">
            <Undo2 size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
            {t("buttons.refund")}
          </a>
        )}
        {drawer !== "unsupported" && (
          <button
            type="button"
            className="receipt-drawer-btn"
            disabled={drawer === "kicking"}
            onClick={() =>
              drawer === "needs_pairing" ? void pairAndKick() : void triggerKick()
            }
          >
            <Banknote size={14} strokeWidth={1.5} style={{ verticalAlign: "middle", marginInlineEnd: "var(--space-1)" }} />
            {drawer === "kicking"
              ? t("buttons.popDrawerPending")
              : drawer === "kicked"
                ? t("buttons.popDrawerDone")
                : drawer === "needs_pairing"
                  ? t("buttons.popDrawerPair")
                  : drawer === "error"
                    ? t("buttons.popDrawerRetry")
                    : t("buttons.popDrawer")}
          </button>
        )}
        {SIZES.filter((s) => s !== size).map((s) => (
          <a key={s} href={`?size=${s}`}>
            {s === "58mm"
              ? t("buttons.switch58")
              : s === "80mm"
                ? t("buttons.switch80")
                : t("buttons.switchA4")}
          </a>
        ))}
      </div>
    </div>
  );
}
