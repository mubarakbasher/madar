"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { majorToMinor } from "@/lib/currency";
import { shiftOpenRequest } from "@/lib/api/shifts";

export function OpenShiftModal({
  branchId,
  currency,
  onOpened,
  onCancel,
}: {
  branchId: string;
  currency: string;
  onOpened: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("pos.shift.open");
  const tErr = useTranslations("pos.shift.errors");
  const qc = useQueryClient();
  const [floatMajor, setFloatMajor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (cents: number) =>
      shiftOpenRequest({
        branch_id: branchId,
        opening_float_cents: cents,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts", "current"] });
      onOpened();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "shift_already_open") setError(tErr("alreadyOpen"));
        else if (err.code === "forbidden_branch") setError(tErr("forbiddenBranch"));
        else if (err.code === "unknown_branch") setError(tErr("unknownBranch"));
        else setError(err.message ?? tErr("generic"));
      } else {
        setError(tErr("network"));
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const major = Number(floatMajor);
    if (!Number.isFinite(major) || major < 0) {
      setError(tErr("invalidFloat"));
      return;
    }
    m.mutate(majorToMinor(major, currency));
  }

  return (
    <div className="pos-modal-bg" role="dialog" aria-modal>
      <div
        className="pos-modal"
        style={{ width: 440, padding: "22px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-modal-head" style={{ padding: 0, borderBottom: "none", marginBlockEnd: 10 }}>
          <h3 className="serif" style={{ margin: 0 }}>{t("title")}</h3>
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginBlockEnd: 16 }}>{t("subtitle")}</p>
        <form onSubmit={submit}>
          <label
            htmlFor="open-shift-float"
            style={{
              display: "block",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ink-3)",
              marginBlockEnd: 6,
            }}
          >
            {t("floatLabel", { currency })}
          </label>
          <input
            id="open-shift-float"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoFocus
            className="pos-input"
            value={floatMajor}
            onChange={(e) => setFloatMajor(e.target.value)}
            placeholder="0.00"
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
            {onCancel && (
              <button
                type="button"
                className="pos-link"
                onClick={onCancel}
                disabled={m.isPending}
              >
                {t("cancel")}
              </button>
            )}
            <button
              type="submit"
              className="pos-pay"
              style={{ height: 44, padding: "0 20px", fontSize: 14 }}
              disabled={m.isPending || floatMajor === ""}
            >
              {m.isPending ? t("opening") : t("open")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
