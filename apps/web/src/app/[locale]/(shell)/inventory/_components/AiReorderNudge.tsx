"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Link } from "../../../../../../i18n/routing";
import {
  reorderSuggestionsRequest,
  type ApiReorderLine,
  type ApiReorderSuggestions,
} from "@/lib/api/reorder";

const HORIZON_DAYS = 7;
const MAX_ITEMS = 3;

function lineName(l: ApiReorderLine, locale: "en" | "ar"): string {
  const n = l.name_i18n;
  if (!n) return l.sku;
  return (locale === "ar" ? n.ar || n.en : n.en || n.ar) || l.sku;
}

function supplierName(
  g: ApiReorderSuggestions["groups"][number],
  locale: "en" | "ar",
): string {
  const n = g.supplier_name_i18n;
  if (!n) return g.supplier_code;
  return (locale === "ar" ? n.ar || n.en : n.en || n.ar) || g.supplier_code;
}

/**
 * Data-driven reorder nudge. Calls GET /v1/reorder/suggestions for the
 * currently-selected branch and renders a real headline (which SKUs are about
 * to run out, suggested order, and supplier). Hidden entirely when nothing is
 * at risk, while loading, on error, when no single branch is selected, or for
 * roles that cannot reorder — so it never shows stale or empty chrome.
 */
export function AiReorderNudge({
  branchId,
  canReorder,
  locale,
}: {
  branchId: string | null;
  canReorder: boolean;
  locale: "en" | "ar";
}) {
  const t = useTranslations("inventory.ai");
  const [showWhy, setShowWhy] = useState(false);

  const q = useQuery({
    queryKey: ["reorder", "suggestions", { branch_id: branchId, horizon: HORIZON_DAYS }],
    queryFn: () => reorderSuggestionsRequest({ branch_id: branchId!, horizon_days: HORIZON_DAYS }),
    enabled: !!branchId && canReorder,
    staleTime: 30_000,
  });

  const data = q.data;
  if (!branchId || !canReorder || !data || data.at_risk_count === 0) return null;

  const flatLines: ApiReorderLine[] = [
    ...data.groups.flatMap((g) => g.lines),
    ...data.ungrouped,
  ];
  const items = flatLines
    .slice(0, MAX_ITEMS)
    .map((l) => `${lineName(l, locale)} (${l.suggested_qty})`)
    .join(locale === "ar" ? "، " : ", ");
  const extra = flatLines.length - MAX_ITEMS;
  const itemsText = extra > 0 ? `${items} ${t("andMore", { count: extra })}` : items;

  let suggest: string;
  if (data.groups.length === 1 && data.ungrouped.length === 0) {
    suggest = t("suggestBundled", { items: itemsText, supplier: supplierName(data.groups[0]!, locale) });
  } else if (data.groups.length >= 1) {
    suggest = t("suggestMulti", { items: itemsText, suppliers: data.groups.length });
  } else {
    suggest = t("suggestPlain", { items: itemsText });
  }

  return (
    <div className="inv-ai">
      <div className="inv-ai-inner">
        <Sparkles size={16} strokeWidth={1.5} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <p className="inv-ai-text">
          <strong>{t("summaryLead", { count: data.at_risk_count, days: data.horizon_days })}</strong>{" "}
          {suggest}
          {showWhy && <span className="inv-ai-why"> {t("whyExplain")}</span>}
        </p>
        <Link href={"/inventory/reorder" as "/inventory/categories"} className="inv-btn inv-btn-primary">
          {t("review")}
        </Link>
        <button type="button" className="inv-btn inv-btn-ghost" onClick={() => setShowWhy((v) => !v)}>
          {t("why")}
        </button>
      </div>
    </div>
  );
}
