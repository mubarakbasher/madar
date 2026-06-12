"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { productUpdateRequest } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { currencyMinorUnits, majorToMinor } from "@/lib/currency";

interface SelectedRow {
  id: string;
  name: string;
  priceMajor: number;
}

type Mode = "set" | "pct";

/**
 * Bulk price update for the selected products. Loops PATCH /v1/products/:id —
 * the API already supports per-product price changes (1.8b). We keep the
 * client-side fan-out simple instead of inventing a bulk-PATCH endpoint: at
 * 21-product seed scale the latency is unnoticeable and the audit log gets
 * one row per product, which is what auditors want anyway.
 */
export function BulkEditPriceModal({
  rows,
  currencyCode,
  onClose,
  onDone,
}: {
  rows: SelectedRow[];
  currencyCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("inventory.bulk.editPriceModal");
  const [mode, setMode] = useState<Mode>("set");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fractionDigits = currencyMinorUnits(currencyCode);

  function previewPriceMajor(currentMajor: number): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    if (mode === "set") return n;
    // pct: +X% (positive grows, negative shrinks). Round to the currency's
    // real precision (KWD=3 dp, JPY=0 dp).
    const f = 10 ** fractionDigits;
    return Math.max(0, Math.round(currentMajor * (1 + n / 100) * f) / f);
  }

  async function submit(): Promise<void> {
    setError(null);
    const total = rows.length;
    if (total === 0) {
      onClose();
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError(t("errors.invalidNumber"));
      return;
    }
    if (mode === "set" && n < 0) {
      setError(t("errors.negativePrice"));
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total });
    let failed = 0;
    for (const row of rows) {
      try {
        const nextMajor = previewPriceMajor(row.priceMajor);
        if (nextMajor === null) {
          failed += 1;
        } else {
          const cents = majorToMinor(nextMajor, currencyCode);
          await productUpdateRequest(row.id, { price_cents: cents });
        }
      } catch (err) {
        failed += 1;
        if (err instanceof ApiError && err.code === "forbidden_during_impersonation") {
          setError(t("errors.impersonating"));
          break;
        }
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
    }
    setBusy(false);
    if (failed > 0 && !error) setError(t("errors.partial", { failed, total }));
    if (failed === 0) onDone();
  }

  const sample = rows[0];
  const sampleNext = sample ? previewPriceMajor(sample.priceMajor) : null;

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBlockEnd: "1px solid var(--rule)",
          }}
        >
          <div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: 0 }}>
              {t("title")}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
              {t("subtitle", { count: rows.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-2)" }}
            aria-label={t("close")}
          >
            <X size={16} />
          </button>
        </header>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", marginBlockEnd: 14 }}>
            <ModeChip active={mode === "set"} onClick={() => setMode("set")}>
              {t("modes.set")}
            </ModeChip>
            <ModeChip active={mode === "pct"} onClick={() => setMode("pct")}>
              {t("modes.pct")}
            </ModeChip>
          </div>

          <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: "var(--space-1)" }}>
            {mode === "set" ? t("setLabel") : t("pctLabel")}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            autoFocus
            placeholder={mode === "set" ? "0.00" : "+10"}
            style={{
              width: "100%",
              padding: "var(--space-2) 10px",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              fontSize: 14,
              background: "var(--bg)",
              color: "var(--ink-1)",
              fontFamily: "var(--mono, monospace)",
            }}
          />

          {sample && value && sampleNext !== null && (
            <p style={{ marginBlockStart: 10, fontSize: 12, color: "var(--ink-3)" }}>
              {t("preview", {
                name: sample.name,
                from: sample.priceMajor.toFixed(fractionDigits),
                to: sampleNext.toFixed(fractionDigits),
              })}
            </p>
          )}

          {progress && (
            <p style={{ marginBlockStart: "var(--space-2)", fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
              {t("progress", { done: progress.done, total: progress.total })}
            </p>
          )}

          {error && (
            <div
              style={{
                marginBlockStart: "var(--space-3)",
                background: "color-mix(in oklab, var(--rose, #c45a5a) 12%, transparent)",
                border: "1px solid var(--rose, #c45a5a)",
                color: "var(--rose, #c45a5a)",
                fontSize: 12.5,
                padding: "var(--space-2) 10px",
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginBlockStart: "var(--space-4)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: "var(--space-2) 14px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid var(--rule)",
                background: "transparent",
                color: "var(--ink-1)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || value.length === 0}
              style={{
                padding: "var(--space-2) 14px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {busy ? t("applying") : t("apply", { count: rows.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px var(--space-3)",
        borderRadius: "var(--radius-full)",
        fontSize: 12.5,
        border: `1px solid ${active ? "var(--accent)" : "var(--rule)"}`,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent-ink, var(--ink-1))" : "var(--ink-2)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
