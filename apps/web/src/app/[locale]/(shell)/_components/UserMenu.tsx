"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/routing";
import { logoutRequest } from "../../../../lib/api/auth";
import { useAuthStore } from "../../../../lib/auth/store";

export function UserMenu({ locale }: { locale: string }) {
  const t = useTranslations("shell.topbar");
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? "U";

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function handleSignOut() {
    try {
      await logoutRequest();
    } catch {
      // proceed even if server call fails
    } finally {
      useAuthStore.getState().clearAuth();
      window.location.assign(`/${locale}/login`);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="tb-avatar"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("userMenu")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: "calc(100% + 8px)",
            minWidth: 200,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 12,
            boxShadow: "0 8px 32px -12px rgba(15,15,15,0.18)",
            padding: "6px",
            zIndex: 100,
          }}
        >
          {user && (
            <div
              style={{
                padding: "8px 10px 10px",
                borderBottom: "1px solid var(--rule)",
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {user.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                {user.email}
              </div>
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            className="um-item"
            onClick={() => { setOpen(false); router.push("/settings/profile", { locale }); }}
          >
            <User size={14} strokeWidth={1.5} />
            {t("profile")}
          </button>

          <button
            type="button"
            role="menuitem"
            className="um-item"
            onClick={() => { setOpen(false); router.push("/settings", { locale }); }}
          >
            <Settings size={14} strokeWidth={1.5} />
            {t("settings")}
          </button>

          <div style={{ height: 1, background: "var(--rule)", margin: "4px 0" }} />

          <button
            type="button"
            role="menuitem"
            className="um-item um-item-danger"
            onClick={handleSignOut}
          >
            <LogOut size={14} strokeWidth={1.5} />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
