"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api/client";

interface AdjustmentBody {
  branch_id: string;
  product_id: string;
  qty_delta: number;
  note: string;
  kind?: "adjustment" | "waste";
}

function postAdjustment(body: AdjustmentBody): Promise<unknown> {
  return apiFetch("/v1/stock-adjustments", { method: "POST", body });
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-2) 10px",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--bg)",
  color: "var(--ink-1)",
  fontFamily: "inherit",
};

/**
 * Single-product stock adjustment at one branch (1.9). Reuses POST
 * /v1/stock-adjustments — the same ledger-backed endpoint as the bulk modal,
 * but branch and product are fixed, so it's one request with a live preview of
 * the resulting on-hand total before the manager commits.
 */
export function SingleAdjustStockModal({
  productId,
  productName,
  branchId,
  branchCode,
  branchName,
  currentQty,
  onClose,
  onDone,
}: {
  productId: string;
  productName: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  currentQty: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("inventory.detail.stock.adjust");
  const [delta, setDelta] = useState("");
  const [kind, setKind] = useState<"adjustment" | "waste">("adjustment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDelta = Number(delta);
  const deltaValid = Number.isFinite(parsedDelta) && parsedDelta !== 0 && Number.isInteger(parsedDelta);
  const newTotal = deltaValid ? currentQty + parsedDelta : currentQty;
  const wouldGoNegative = deltaValid && newTotal < 0;

  async function submit(): Promise<void> {
    setError(null);
    if (!deltaValid) {
      setError(t("errors.invalidDelta"));
      return;
    }
    if (!note.trim()) {
      setError(t("errors.noteRequired"));
      return;
    }
    setBusy(true);
    try {
      await postAdjustment({
        branch_id: branchId,
        product_id: productId,
        qty_delta: parsedDelta,
        kind,
        note: note.trim(),
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === "negative_stock" ? t("errors.negativeStock") : err.message);
      } else {
        setError(t("errors.generic"));
      }
      setBusy(false);
    }
  }

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
          width: 420,
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
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: 0 }}>{t("title")}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-3)" }}>{productName}</p>
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
          {/* Read-only branch + current on-hand context */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "10px var(--space-3)",
              background: "var(--bg)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--ink-2)" }}>
              <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>{branchCode}</code>{" "}
              {branchName}
            </span>
            <span style={{ color: "var(--ink-3)" }}>
              {t("currentLabel")}{" "}
              <strong style={{ color: "var(--ink-1)", fontVariantNumeric: "tabular-nums" }}>{currentQty}</strong>
            </span>
          </div>

          <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: "var(--space-1)", marginBlockStart: 14 }}>
            {t("deltaLabel")}
          </label>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            disabled={busy}
            placeholder="-5 or +10"
            style={{ ...inputStyle, fontFamily: "var(--mono, monospace)" }}
          />

          {deltaValid && (
            <p
              style={{
                marginBlockStart: "var(--space-2)",
                fontSize: 12.5,
                color: wouldGoNegative ? "var(--rose, #c45a5a)" : "var(--ink-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {t("newTotalLabel")}{" "}
              <strong>{newTotal}</strong>
            </p>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", marginBlockStart: 14 }}>
            {(["adjustment", "waste"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                disabled={busy}
                style={{
                  padding: "6px var(--space-3)",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12.5,
                  border: `1px solid ${kind === k ? "var(--accent)" : "var(--rule)"}`,
                  background: kind === k ? "var(--accent-soft)" : "transparent",
                  color: kind === k ? "var(--accent-ink, var(--ink-1))" : "var(--ink-2)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t(`kinds.${k}`)}
              </button>
            ))}
          </div>

          <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: "var(--space-1)", marginBlockStart: 14 }}>
            {t("noteLabel")}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            maxLength={280}
            placeholder={t("notePlaceholder")}
            style={inputStyle}
          />

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
              disabled={busy || !deltaValid || !note.trim()}
              style={{
                padding: "var(--space-2) 14px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "white",
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: busy || !deltaValid || !note.trim() ? 0.6 : 1,
              }}
            >
              {busy ? t("applying") : t("apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
