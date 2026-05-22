"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

export function InventoryError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("inventory.error");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px",
        gap: 16,
      }}
      role="alert"
    >
      <div
        style={{
          width: 56,
          height: 56,
          display: "grid",
          placeItems: "center",
          borderRadius: 14,
          background: "color-mix(in oklab, var(--rose) 14%, var(--bg-elev))",
          color: "var(--rose)",
        }}
      >
        <AlertTriangle size={28} strokeWidth={1.5} />
      </div>
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 24,
          letterSpacing: "-0.02em",
          margin: 0,
          color: "var(--ink)",
        }}
      >
        {t("title")}
      </h2>
      <p style={{ color: "var(--ink-3)", maxWidth: 360, fontSize: 14, margin: 0 }}>
        {t("body")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl"
        style={{
          marginTop: 8,
          height: 40,
          paddingInline: 16,
          background: "var(--bg)",
          color: "var(--ink)",
          fontSize: 14,
          fontWeight: 500,
          border: "1px solid var(--rule)",
        }}
      >
        <RefreshCw size={14} strokeWidth={1.5} />
        {t("retry")}
      </button>
    </div>
  );
}
