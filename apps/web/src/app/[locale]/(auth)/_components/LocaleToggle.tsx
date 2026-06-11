"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "../../../../../i18n/routing";

const labels: Record<string, string> = { en: "EN", ar: "ع" };

export function LocaleToggle() {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale();

  function switchTo(next: "en" | "ar") {
    if (next === current) return;
    router.replace(pathname, { locale: next });
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex items-center gap-1 rounded-full border px-1 py-1 text-[12px]"
      style={{
        borderColor: "var(--rule)",
        background: "var(--bg-elev)",
        color: "var(--ink-2)",
      }}
    >
      {(["en", "ar"] as const).map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchTo(loc)}
            aria-pressed={active}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "white" : "var(--ink-2)",
              fontFamily: loc === "ar" ? "var(--font-arabic, var(--sans))" : "var(--sans)",
            }}
          >
            {labels[loc]}
          </button>
        );
      })}
    </div>
  );
}
