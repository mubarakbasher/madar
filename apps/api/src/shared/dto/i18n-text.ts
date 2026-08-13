import { z } from "zod";

/**
 * Translatable text stored as jsonb `{ en, ar }`.
 *
 * Tenants type a single value in whichever language they use; the missing or
 * empty side is mirrored from the other at validation time, so every stored
 * row always carries both keys non-empty. Display, search (`ILIKE` over both
 * keys), and sort (`name_i18n->>'<locale>'`) rely on that invariant and never
 * need per-key fallbacks. Callers that genuinely have two translations may
 * still send both keys — distinct values are kept as-is.
 */
export function i18nText(max: number) {
  return z
    .object({
      en: z.string().trim().max(max).optional(),
      ar: z.string().trim().max(max).optional(),
    })
    .refine((v) => Boolean(v.en?.length) || Boolean(v.ar?.length), {
      message: "Provide the text in at least one language",
    })
    .transform((v) => ({
      en: v.en?.length ? v.en : (v.ar as string),
      ar: v.ar?.length ? v.ar : (v.en as string),
    }));
}

export type I18nText = { en: string; ar: string };
