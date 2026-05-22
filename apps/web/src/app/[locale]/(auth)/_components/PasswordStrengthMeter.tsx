"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

const LABELS = ["weak", "weak", "okay", "good", "strong", "excellent"] as const;

function score(password: string): number {
  if (!password) return 0;
  let n = 0;
  if (password.length >= 8) n++;
  if (password.length >= 12) n++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) n++;
  if (/\d/.test(password)) n++;
  if (/[^A-Za-z0-9]/.test(password)) n++;
  return Math.min(5, n);
}

/** Pure visual indicator — never blocks submit. Server enforces its own min. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const t = useTranslations("auth.passwordStrength");
  const value = useMemo(() => score(password), [password]);
  const filled = value;
  const labelKey = LABELS[value];
  const color = ((): string => {
    if (value <= 1) return "var(--rose, #c45a5a)";
    if (value === 2) return "var(--amber, #d49a36)";
    if (value === 3) return "var(--amber, #d49a36)";
    return "var(--sage, #6e9b7f)";
  })();

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1.5" dir="ltr">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{
              background:
                i < filled
                  ? color
                  : "color-mix(in oklab, var(--ink-3) 18%, transparent)",
            }}
          />
        ))}
      </div>
      {password && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          {t("label")}: <span style={{ color }}>{t(labelKey)}</span>
        </div>
      )}
    </div>
  );
}
