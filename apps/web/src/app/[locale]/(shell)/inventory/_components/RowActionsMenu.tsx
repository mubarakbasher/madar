"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Link, useRouter } from "../../../../../../i18n/routing";
import { productDeleteRequest } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";

export function RowActionsMenu({ productId, productName }: { productId: string; productName: string }) {
  const t = useTranslations("inventory.row");
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const deleteMutation = useMutation({
    mutationFn: () => productDeleteRequest(productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      setConfirming(false);
      setOpen(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "forbidden_during_impersonation") {
        alert(t("impersonationBlocked"));
      } else if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert(t("deleteFailed"));
      }
      setConfirming(false);
    },
  });

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="inv-row-action"
        aria-label={t("moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: "100%",
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--rule)",
            borderRadius: 10,
            boxShadow: "0 12px 32px -16px rgba(0,0,0,0.25)",
            zIndex: 20,
            minWidth: 160,
            overflow: "hidden",
          }}
        >
          {!confirming && (
            <>
              <Link
                href={`/inventory/products/${productId}/edit`}
                onClick={() => setOpen(false)}
                style={menuItemStyle()}
                role="menuitem"
              >
                <Pencil size={13} strokeWidth={1.5} />
                {t("edit")}
              </Link>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                style={{ ...menuItemStyle(), color: "var(--rose)" }}
                role="menuitem"
              >
                <Trash2 size={13} strokeWidth={1.5} />
                {t("delete")}
              </button>
            </>
          )}
          {confirming && (
            <div style={{ padding: 12 }}>
              <p style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
                {t("confirmDelete", { name: productName })}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  style={{
                    flex: 1,
                    height: 30,
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    color: "var(--ink-2)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  style={{
                    flex: 1,
                    height: 30,
                    background: "var(--rose)",
                    border: "none",
                    borderRadius: 6,
                    color: "white",
                    fontSize: 12,
                    cursor: deleteMutation.isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {deleteMutation.isPending ? t("deleting") : t("confirmYes")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--ink)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "start",
    textDecoration: "none",
  };
}
