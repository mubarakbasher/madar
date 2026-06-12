"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Printer, X } from "lucide-react";

interface PrintRow {
  sku: string;
  name: string;
  priceMajor: number;
  currency: string;
}

/**
 * Print-friendly label sheet. Renders a tile per selected product with SKU
 * (mono), name, price; uses `@media print` to hide chrome and gives a clean
 * 3-column grid that fits A4 sticker stock. Browser print dialog drives the
 * actual output — barcode renderers + thermal-printer adapters land in a
 * later slice. Real barcode SVGs would need `jsbarcode` or similar.
 */
export function PrintLabelsSheet({
  rows,
  currency,
  onClose,
}: {
  rows: PrintRow[];
  currency: string;
  onClose: () => void;
}) {
  const t = useTranslations("inventory.bulk.printLabels");

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        zIndex: 70,
        overflow: "auto",
      }}
    >
      <style>{`
        @media print {
          .pl-toolbar { display: none !important; }
          body { background: white !important; }
        }
        .pl-tile {
          break-inside: avoid;
        }
      `}</style>
      <header
        className="pl-toolbar"
        style={{
          position: "sticky",
          insetBlockStart: 0,
          background: "var(--bg-elev)",
          borderBlockEnd: "1px solid var(--rule)",
          padding: "var(--space-3) var(--space-5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 1,
        }}
      >
        <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 18 }}>
          {t("title", { count: rows.length })}
        </h2>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: "var(--space-2) 14px",
              borderRadius: 8,
              fontSize: 13,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "white",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Printer size={14} strokeWidth={1.5} />
            {t("printButton")}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "var(--space-2) 14px",
              borderRadius: 8,
              fontSize: 13,
              border: "1px solid var(--rule)",
              background: "transparent",
              color: "var(--ink-1)",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <X size={14} strokeWidth={1.5} />
            {t("close")}
          </button>
        </div>
      </header>

      <main style={{ padding: "var(--space-5)", maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--space-3)",
          }}
        >
          {rows.map((r) => (
            <div
              key={r.sku}
              className="pl-tile"
              style={{
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius)",
                padding: "var(--space-4) 18px",
                background: "white",
                color: "#000",
                minHeight: 140,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono, ui-monospace, monospace)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: "#777",
                  }}
                >
                  {r.sku}
                </div>
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 18,
                    fontWeight: 500,
                    marginBlockStart: "var(--space-1)",
                    lineHeight: 1.2,
                  }}
                >
                  {r.name}
                </div>
              </div>
              <div
                style={{
                  marginBlockStart: "var(--space-3)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: 11, color: "#777" }}>{r.currency}</span>
                <span
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 28,
                    fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {r.priceMajor.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p
          style={{
            marginBlockStart: "var(--space-5)",
            fontSize: 11,
            color: "var(--ink-3)",
            textAlign: "center",
          }}
        >
          {t("hint")}
        </p>
      </main>
    </div>
  );
}
