/**
 * Bilingual template strings for the deterministic dashboard insight engine.
 *
 * The server interpolates these and ships the final EN+AR strings on the wire
 * (`headline_i18n`, `body_i18n`) so the client just renders. Placeholders use
 * the `{key}` syntax — `interpolate()` swaps them for `vars[key]`.
 *
 * Keep the EN/AR pair tonally aligned (calm, editorial, no exclamation marks)
 * per `docs/i18n-glossary.md`. If a new domain term shows up, propose it in
 * the glossary first, then update both locales here.
 */

type Locale = "en" | "ar";

export interface InsightCopy {
  headline: string;
  body: string;
}

export type InsightCopyByLocale = Record<Locale, InsightCopy>;

export const INSIGHT_COPY: Record<string, InsightCopyByLocale> = {
  branch_decline: {
    en: {
      headline: "{branch} dropped {pct}% vs last week",
      body: "Revenue is down {pct}% this week. Open the branch dashboard to see what changed.",
    },
    ar: {
      headline: "{branch} انخفض {pct}٪ مقارنة بالأسبوع الماضي",
      body: "الإيرادات منخفضة {pct}٪ هذا الأسبوع. افتح لوحة الفرع لمعرفة سبب التغيير.",
    },
  },
  concentration: {
    en: {
      headline: "{product} is {pct}% of this week's revenue",
      body: "One product is carrying the week. Consider promoting alternatives or checking stock depth.",
    },
    ar: {
      headline: "{product} يمثل {pct}٪ من إيرادات هذا الأسبوع",
      body: "منتج واحد يقود الأسبوع. فكر في الترويج لبدائل أو مراجعة عمق المخزون.",
    },
  },
  stale_payment_proof: {
    en: {
      headline: "{count} payment {noun} waiting over 48 hours",
      body: "Bank-transfer receipts older than two days need a verifier. Open the queue to clear them.",
    },
    ar: {
      headline: "{count} إثبات دفع بانتظار التحقق منذ أكثر من 48 ساعة",
      body: "إيصالات التحويل البنكي الأقدم من يومين تحتاج إلى مراجعة. افتح قائمة التحقق لإكمالها.",
    },
  },
  low_stock_critical: {
    en: {
      headline: "{count} {noun} out of stock",
      body: "These products are at zero on hand across one or more branches. Plan a reorder or transfer.",
    },
    ar: {
      headline: "{count} {noun} بدون مخزون",
      body: "هذه المنتجات صفر في الفروع. خطط لإعادة الطلب أو التحويل.",
    },
  },
  growth_winner: {
    en: {
      headline: "{branch} up {pct}% vs last week",
      body: "Strong week. Capture what's working — staffing, promo, restock cadence — and replicate.",
    },
    ar: {
      headline: "{branch} ارتفع {pct}٪ مقارنة بالأسبوع الماضي",
      body: "أسبوع قوي. وثّق ما نجح — التوظيف، العروض، وتيرة إعادة التخزين — وكرره.",
    },
  },
  week_recap: {
    en: {
      headline: "Steady week — {revenue} across {transactions} sales",
      body: "Nothing urgent on the rail. Use the calm to plan next week.",
    },
    ar: {
      headline: "أسبوع ثابت — {revenue} عبر {transactions} عملية بيع",
      body: "لا توجد تنبيهات عاجلة. استغل الهدوء للتخطيط للأسبوع القادم.",
    },
  },
};

/**
 * Replace every `{key}` token in `template` with `vars[key]`. Missing keys
 * resolve to the literal placeholder so a typo never blows up the request —
 * the rendered string will surface the bug instead.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
