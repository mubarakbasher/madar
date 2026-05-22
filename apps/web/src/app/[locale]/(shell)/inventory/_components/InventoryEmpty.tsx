"use client";
import { PackageOpen } from "lucide-react";
import { useTranslations } from "next-intl";

export function InventoryEmpty() {
  const t = useTranslations("inventory.empty");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "96px 24px",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          display: "grid",
          placeItems: "center",
          borderRadius: 16,
          background:
            "color-mix(in oklab, var(--accent) 12%, var(--bg-elev))",
          color: "var(--accent)",
        }}
      >
        <PackageOpen size={36} strokeWidth={1.4} />
      </div>
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 28,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          margin: 0,
          color: "var(--ink)",
        }}
      >
        {t("title")}
      </h2>
      <p
        style={{
          color: "var(--ink-3)",
          maxWidth: 380,
          fontSize: 14,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {t("body")}
      </p>
      <button
        type="button"
        aria-disabled="true"
        title={t("comingSoon")}
        className="rounded-xl"
        style={{
          marginTop: 8,
          height: 44,
          paddingInline: 20,
          background: "var(--accent)",
          color: "white",
          fontSize: 14,
          fontWeight: 500,
          opacity: 0.45,
          cursor: "not-allowed",
          boxShadow: "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
        }}
      >
        {t("addProduct")}
      </button>
    </div>
  );
}
