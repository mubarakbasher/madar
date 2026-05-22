"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

export function AiReorderNudge() {
  const t = useTranslations("inventory.ai");

  return (
    <div className="inv-ai">
      <div className="inv-ai-inner">
        <Sparkles size={16} strokeWidth={1.5} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <p className="inv-ai-text">
          {t.rich("headline", { b: (chunks) => <b>{chunks}</b> })}
        </p>
        <button type="button" className="inv-btn inv-btn-primary">
          {t("review")}
        </button>
        <button type="button" className="inv-btn inv-btn-ghost">
          {t("why")}
        </button>
      </div>
    </div>
  );
}
