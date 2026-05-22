"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { shiftCloseRequest, type ApiShiftDetail } from "@/lib/api/shifts";

export function EndShiftModal({
  shiftId,
  currency,
  onClosed,
  onCancel,
}: {
  shiftId: string;
  currency: string;
  onClosed: (z: ApiShiftDetail) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("pos.shift.close");
  const tErr = useTranslations("pos.shift.errors");
  const qc = useQueryClient();
  const [cashMajor, setCashMajor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (cents: number) =>
      shiftCloseRequest(shiftId, {
        declared_closing_cash_cents: cents,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["shifts", "current"] });
      onClosed(data);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "shift_already_closed") setError(tErr("alreadyClosed"));
        else if (err.code === "forbidden_role") setError(tErr("forbiddenRole"));
        else setError(err.message ?? tErr("generic"));
      } else {
        setError(tErr("network"));
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const major = Number(cashMajor);
    if (!Number.isFinite(major) || major < 0) {
      setError(tErr("invalidCash"));
      return;
    }
    m.mutate(Math.round(major * 100));
  }

  return (
    <div className="pos-modal-bg" role="dialog" aria-modal>
      <div
        className="pos-modal"
        style={{ width: 480, padding: "22px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-modal-head" style={{ padding: 0, borderBottom: "none", marginBlockEnd: 10 }}>
          <h3 className="serif" style={{ margin: 0 }}>{t("title")}</h3>
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginBlockEnd: 16 }}>{t("subtitle")}</p>
        <form onSubmit={submit}>
          <label
            htmlFor="close-shift-cash"
            style={{
              display: "block",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ink-3)",
              marginBlockEnd: 6,
            }}
          >
            {t("cashLabel", { currency })}
          </label>
          <input
            id="close-shift-cash"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoFocus
            className="pos-input"
            value={cashMajor}
            onChange={(e) => setCashMajor(e.target.value)}
            placeholder="0.00"
          />

          <label
            htmlFor="close-shift-notes"
            style={{
              display: "block",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ink-3)",
              marginBlockEnd: 6,
              marginBlockStart: 16,
            }}
          >
            {t("notesLabel")}
          </label>
          <textarea
            id="close-shift-notes"
            className="pos-input"
            style={{ minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />

          {error && (
            <div
              role="alert"
              style={{
                marginBlockStart: 10,
                padding: "8px 10px",
                background: "color-mix(in oklab, var(--rose) 10%, transparent)",
                color: "var(--rose)",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBlockStart: 20 }}>
            <button type="button" className="pos-link" onClick={onCancel} disabled={m.isPending}>
              {t("cancel")}
            </button>
            <button
              type="submit"
              className="pos-pay"
              style={{ height: 44, padding: "0 20px", fontSize: 14 }}
              disabled={m.isPending || cashMajor === ""}
            >
              {m.isPending ? t("closing") : t("close")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
