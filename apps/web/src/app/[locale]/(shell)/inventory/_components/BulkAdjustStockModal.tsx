"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { branchesListRequest, type ApiBranchSummary } from "@/lib/api/branches";
import { apiFetch, ApiError } from "@/lib/api/client";

interface SelectedRow {
  id: string;
  name: string;
}

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

/**
 * Bulk stock adjustment for the selected products. Loops POST
 * /v1/stock-adjustments (1.9). Same delta applied to every selected product
 * at one chosen branch — most realistic case for a manager fixing a count
 * after a recount, or writing off a damaged batch.
 */
export function BulkAdjustStockModal({
  rows,
  onClose,
  onDone,
}: {
  rows: SelectedRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("inventory.bulk.adjustStockModal");
  const [branchId, setBranchId] = useState<string>("");
  const [delta, setDelta] = useState("");
  const [kind, setKind] = useState<"adjustment" | "waste">("adjustment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesListRequest(),
    staleTime: 60_000,
  });

  const branches: ApiBranchSummary[] = branchesQ.data?.items ?? [];

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(branches[0]!.id);
    }
  }, [branches, branchId]);

  async function submit(): Promise<void> {
    setError(null);
    const total = rows.length;
    if (total === 0) {
      onClose();
      return;
    }
    if (!branchId) {
      setError(t("errors.branchRequired"));
      return;
    }
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0 || !Number.isInteger(n)) {
      setError(t("errors.invalidDelta"));
      return;
    }
    if (!note.trim()) {
      setError(t("errors.noteRequired"));
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total });
    let failed = 0;
    let firstError: string | null = null;
    for (const row of rows) {
      try {
        await postAdjustment({
          branch_id: branchId,
          product_id: row.id,
          qty_delta: n,
          kind,
          note: note.trim(),
        });
      } catch (err) {
        failed += 1;
        if (err instanceof ApiError) {
          if (err.code === "negative_stock" && !firstError) {
            firstError = t("errors.negativeStock", { name: row.name });
          } else if (!firstError) {
            firstError = err.message;
          }
        }
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
    }
    setBusy(false);
    if (failed > 0) {
      setError(firstError ?? t("errors.partial", { failed, total }));
      if (failed < total) onDone();
    } else {
      onDone();
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
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "100%",
          background: "var(--bg-elev)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: 4 }}>
                {t("branchLabel")}
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={busy || branchesQ.isPending}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "var(--bg)",
                  color: "var(--ink-1)",
                  fontFamily: "inherit",
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_i18n.en} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: 4 }}>
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
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "var(--bg)",
                  color: "var(--ink-1)",
                  fontFamily: "var(--mono, monospace)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBlockStart: 14 }}>
            {(["adjustment", "waste"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                disabled={busy}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
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

          <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBlockEnd: 4, marginBlockStart: 14 }}>
            {t("noteLabel")}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            maxLength={280}
            placeholder={t("notePlaceholder")}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              fontSize: 13,
              background: "var(--bg)",
              color: "var(--ink-1)",
              fontFamily: "inherit",
            }}
          />

          {progress && (
            <p style={{ marginBlockStart: 10, fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
              {t("progress", { done: progress.done, total: progress.total })}
            </p>
          )}

          {error && (
            <div
              style={{
                marginBlockStart: 12,
                background: "color-mix(in oklab, var(--rose, #c45a5a) 12%, transparent)",
                border: "1px solid var(--rose, #c45a5a)",
                color: "var(--rose, #c45a5a)",
                fontSize: 12.5,
                padding: "8px 10px",
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBlockStart: 16 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: "8px 14px",
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
              disabled={busy || !branchId || !delta || !note.trim()}
              style={{
                padding: "8px 14px",
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
