"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, Pause } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRouter } from "../../../../../i18n/routing";
import { logoutRequest } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/auth/store";
import { OfflineChip } from "@/components/OfflineChip";

export function PosHeader({
  branchName,
  heldCount,
  onToggleHeld,
  heldOpen,
  shiftSlot,
}: {
  branchName: string;
  heldCount: number;
  onToggleHeld: () => void;
  heldOpen: boolean;
  /** When the cashier has an open shift, the parent renders a `<ShiftChip>` —
   *  the header inlines it inline of the legacy hardcoded "shift #247" copy. */
  shiftSlot?: React.ReactNode;
}) {
  const t = useTranslations("pos.header");
  const router = useRouter();
  const [time, setTime] = useState(formatNow());
  const [endingShift, setEndingShift] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(formatNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Provisional end-of-shift handler: confirm → server logout (revokes
  // refresh token) → clear in-memory auth → bounce to /login. The full
  // shift-close flow (z-report, drawer count, held-tickets sweep) lands with
  // the cash-drawer module (PAGES.md §29, Phase 2).
  async function handleEndShift(): Promise<void> {
    if (endingShift) return;
    if (typeof window !== "undefined" && !window.confirm(t("endShiftConfirm"))) {
      return;
    }
    setEndingShift(true);
    try {
      await logoutRequest();
    } catch {
      // Even if the server call fails, clear the client session — the user
      // explicitly asked to end the shift and we shouldn't leave them logged
      // in just because the network blipped.
    } finally {
      useAuthStore.getState().clearAuth();
      router.replace("/login");
    }
  }

  return (
    <header className="pos-head">
      <div className="pos-head-left">
        <Link
          href="/"
          className="pos-exit"
          aria-label={t("exit")}
          title={t("exit")}
        >
          <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
          <span className="pos-exit-label">{t("exit")}</span>
        </Link>
        <div className="pos-shift-dot" aria-label={t("shiftOpen")} />
        <div className="pos-meta">
          <strong>{branchName}</strong>
          {shiftSlot && (
            <>
              <span className="pos-sep">·</span>
              {shiftSlot}
            </>
          )}
        </div>
      </div>
      <div className="pos-head-right">
        <OfflineChip />
        <button type="button" className="pos-pill" onClick={onToggleHeld} aria-pressed={heldOpen}>
          <Pause size={12} strokeWidth={1.5} />
          {t("held")}
          {heldCount > 0 && <span className="pos-pill-badge tnum">{heldCount}</span>}
        </button>
        <span className="pos-clock tnum">{time}</span>
        <span className="pos-sep">·</span>
        <span className="text-xs text-ink-3">
          <strong className="tnum text-ink-2">38</strong> {t("tickets")} ·{" "}
          <strong className="tnum text-ink-2">£8,420</strong>
        </span>
        <button
          type="button"
          className="pos-btn"
          style={{ marginInlineStart: 8 }}
          onClick={handleEndShift}
          disabled={endingShift}
        >
          {endingShift ? t("endShiftBusy") : t("endShift")}
        </button>
      </div>
    </header>
  );
}

function formatNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
