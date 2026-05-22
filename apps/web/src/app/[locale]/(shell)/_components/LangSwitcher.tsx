"use client";

import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "../../../../../i18n/routing";

export function LangSwitcher({ locale }: { locale: string }) {
  const t = useTranslations("shell.topbar");
  const pathname = usePathname();
  const router = useRouter();
  const target = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      className="tb-icon-btn"
      onClick={() => router.replace(pathname, { locale: target })}
      title={t("switchLang")}
      aria-label={t("switchLang")}
    >
      <Globe size={16} strokeWidth={1.5} />
    </button>
  );
}
