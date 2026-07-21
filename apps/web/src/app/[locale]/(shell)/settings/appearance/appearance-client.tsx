"use client";

import { useTranslations } from "next-intl";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { useThemePreference, type ThemePreference } from "@/lib/theme/theme";

const OPTIONS: Array<{ value: ThemePreference; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: MonitorSmartphone },
];

export function AppearanceClient() {
  const t = useTranslations("settings.appearance");
  const [pref, setPref] = useThemePreference();

  return (
    <section>
      <h1
        className="serif"
        style={{ fontSize: 22, margin: 0, marginBlockEnd: "var(--space-2)" }}
      >
        {t("title")}
      </h1>
      <p style={{ color: "var(--ink-3)", marginBlockStart: 0, marginBlockEnd: "var(--space-5)" }}>
        {t("description")}
      </p>

      <div
        role="radiogroup"
        aria-label={t("title")}
        style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
      >
        {OPTIONS.map(({ value, icon: Icon }) => {
          const active = pref === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPref(value)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--space-2)",
                minWidth: 128,
                padding: "var(--space-4)",
                borderRadius: "var(--radius-lg)",
                border: active
                  ? "1px solid var(--accent)"
                  : "1px solid var(--rule)",
                background: active
                  ? "color-mix(in oklab, var(--accent) 8%, var(--bg-elev))"
                  : "var(--bg-elev)",
                color: active ? "var(--accent-ink)" : "var(--ink-2)",
                boxShadow: active ? "var(--shadow-sm)" : "none",
              }}
            >
              <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{t(value)}</span>
            </button>
          );
        })}
      </div>

      <p style={{ color: "var(--ink-4)", fontSize: 12, marginBlockStart: "var(--space-4)" }}>
        {t("systemHint")}
      </p>
    </section>
  );
}
