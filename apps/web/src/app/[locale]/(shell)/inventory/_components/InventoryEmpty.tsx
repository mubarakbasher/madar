"use client";
import { PackageOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../../../i18n/routing";

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
        padding: "var(--space-9) var(--space-5)",
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
      <Link
        href="/inventory/products/new"
        className="rounded-xl"
        style={{
          marginTop: "var(--space-2)",
          height: 44,
          paddingInline: 20,
          background: "var(--accent)",
          color: "white",
          fontSize: 14,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          textDecoration: "none",
          boxShadow: "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
        }}
      >
        <Plus size={15} strokeWidth={1.5} />
        {t("addProduct")}
      </Link>
    </div>
  );
}
