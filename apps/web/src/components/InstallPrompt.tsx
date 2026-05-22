"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isInstallDismissed, markInstallDismissed } from "@/lib/pwa/register-sw";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * One-shot install card. Hidden after the user installs or dismisses it.
 * Mount anywhere in the shell — it auto-hides when not installable.
 */
export function InstallPrompt(): JSX.Element | null {
  const t = useTranslations("install");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isInstallDismissed()) return;
    setDismissed(false);
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed || !deferred) return null;

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    markInstallDismissed();
    setDismissed(true);
    setDeferred(null);
  }

  function handleDismiss() {
    markInstallDismissed();
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--bg-elev)",
        border: "1px solid var(--rule)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 320,
      }}
    >
      <div style={{ fontWeight: 500, color: "var(--ink)", fontSize: 14 }}>{t("title")}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{t("body")}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="pos-btn pos-btn-primary"
          onClick={handleInstall}
          style={{ flex: 1, justifyContent: "center" }}
        >
          {t("cta")}
        </button>
        <button
          type="button"
          className="pos-btn"
          onClick={handleDismiss}
          style={{ flex: 1, justifyContent: "center" }}
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
