"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, Download } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  productsCsvImportRequest,
  type CsvImportResult,
} from "@/lib/api/catalog";

const TEMPLATE_CSV =
  "sku,name_en,name_ar,category_code,price_cents,cost_cents,barcode,tax_class_code,branch_code,initial_qty,is_active\n" +
  'ESP-001,Espresso,إسبريسو,beans,3500,1200,123456789012,STD,BR-001,50,true\n' +
  'CAP-002,"Cappuccino, large","كابتشينو كبير",beverages,4500,1400,,STD,BR-001,30,true\n';

export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("inventory.import");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "real" | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean): Promise<void> => {
    if (!file) return;
    setError(null);
    setBusy(dryRun ? "dry" : "real");
    try {
      const res = await productsCsvImportRequest(file, { dryRun });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError(t("networkError"));
      }
    } finally {
      setBusy(null);
    }
  };

  const downloadTemplate = (): void => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "madar-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 16, 12, 0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--radius-lg)",
          padding: "22px 26px",
          maxWidth: 640,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px -16px rgba(0, 0, 0, 0.32)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBlockEnd: "var(--space-4)",
          }}
        >
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: 0 }}>
              {t("title")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginBlockStart: "var(--space-1)" }}>
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            className="inv-btn"
            onClick={onClose}
            aria-label={t("close")}
            style={{ padding: 6 }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <div style={{ display: "flex", gap: "var(--space-3)", marginBlockEnd: "var(--space-4)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inv-btn"
            onClick={downloadTemplate}
          >
            <Download size={13} strokeWidth={1.5} />
            {t("downloadTemplate")}
          </button>
          <label
            className="inv-btn"
            style={{ display: "inline-flex", cursor: "pointer" }}
          >
            <Upload size={13} strokeWidth={1.5} />
            {file ? file.name : t("pickFile")}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setResult(null);
              }}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "color-mix(in oklab, var(--rose) 10%, var(--surface-1))",
              border: "1px solid color-mix(in oklab, var(--rose) 30%, var(--line))",
              borderRadius: 8,
              color: "var(--rose)",
              fontSize: 13,
              marginBlockEnd: "var(--space-3)",
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginBlockEnd: "var(--space-4)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--space-3)",
                marginBlockEnd: "var(--space-3)",
              }}
            >
              <Stat label={t("created")} value={result.created} tone="sage" />
              <Stat label={t("updated")} value={result.updated} tone="accent" />
              <Stat
                label={t("errorsLabel")}
                value={result.errors.length}
                tone={result.errors.length > 0 ? "rose" : "muted"}
              />
            </div>
            {result.errors.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  maxHeight: 240,
                  overflowY: "auto",
                  fontSize: 12,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <th style={{ padding: "6px 10px", textAlign: "start" }}>
                        {t("col.row")}
                      </th>
                      <th style={{ padding: "6px 10px", textAlign: "start" }}>
                        {t("col.sku")}
                      </th>
                      <th style={{ padding: "6px 10px", textAlign: "start" }}>
                        {t("col.error")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.slice(0, 100).map((e, i) => (
                      <tr key={i} style={{ borderBlockStart: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 10px", color: "var(--ink-3)" }}>
                          {e.row}
                        </td>
                        <td
                          style={{
                            padding: "6px 10px",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                          }}
                        >
                          {e.sku ?? "—"}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--rose)" }}>
                          {e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.errors.length > 100 && (
                  <div
                    style={{
                      padding: "var(--space-2) 10px",
                      textAlign: "center",
                      color: "var(--ink-3)",
                      borderBlockStart: "1px solid var(--line)",
                    }}
                  >
                    {t("moreErrors", { count: result.errors.length - 100 })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-2)",
            marginBlockStart: "var(--space-4)",
            paddingBlockStart: "var(--space-3)",
            borderBlockStart: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            className="inv-btn"
            disabled={!file || busy !== null}
            onClick={() => void run(true)}
          >
            {busy === "dry" ? t("checking") : t("preview")}
          </button>
          <button
            type="button"
            className="inv-btn inv-btn-primary"
            disabled={!file || busy !== null}
            onClick={() => void run(false)}
          >
            {busy === "real" ? t("importing") : t("import")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sage" | "accent" | "rose" | "muted";
}) {
  const colorMap = {
    sage: "var(--sage, #4d7359)",
    accent: "var(--accent)",
    rose: "var(--rose)",
    muted: "var(--ink-3)",
  } as const;
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "10px var(--space-3)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          color: colorMap[tone],
          marginBlockStart: "var(--space-1)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
