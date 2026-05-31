"use client";
import { Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/routing";
import "../pos.css";

/**
 * Shown on the POS when the signed-in user has no branch linked. Selling is
 * impossible without a branch (inventory commits against one), so we replace the
 * sell screen with a calm explanation instead of letting a sale fail at payment.
 * Owners get a CTA to Users settings where they can link themselves; staff are
 * told to ask an owner/manager.
 */
export function PosNoBranch({ canManage }: { canManage: boolean }) {
  const t = useTranslations("pos.noBranch");
  return (
    <div className="pos">
      <div
        style={{
          minHeight: "100%",
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
            background: "color-mix(in oklab, var(--accent) 12%, var(--bg-elev))",
            color: "var(--accent)",
          }}
        >
          <Store size={36} strokeWidth={1.4} />
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
            maxWidth: 400,
            fontSize: 14,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {t(canManage ? "bodyOwner" : "bodyStaff")}
        </p>
        {canManage && (
          <Link
            href="/settings/users"
            className="rounded-xl"
            style={{
              marginTop: 8,
              height: 44,
              paddingInline: 20,
              background: "var(--accent)",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              boxShadow:
                "0 6px 24px -14px color-mix(in oklab, var(--accent) 70%, transparent)",
            }}
          >
            {t("cta")}
          </Link>
        )}
      </div>
    </div>
  );
}
