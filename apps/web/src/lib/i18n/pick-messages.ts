import type { AbstractIntlMessages } from "next-intl";

/**
 * Narrow the dictionary passed to a NextIntlClientProvider to the top-level
 * namespaces a route group's CLIENT components actually use. Server-side
 * useTranslations/getTranslations are unaffected (they read the full request
 * config), so this only trims the JSON embedded in the HTML payload —
 * ~130–168 KB per locale when passed whole.
 *
 * If a client component reads a namespace that wasn't picked, next-intl
 * renders the raw key and logs (no crash) — add the namespace to that
 * group's layout.
 */
export function pickMessages(
  messages: AbstractIntlMessages,
  keys: string[],
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const k of keys) {
    const v = messages[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
