---
name: madar-i18n-sync
description: Keep apps/web English and Arabic translations in lockstep. Run after adding any user-facing string to the tenant app. Catches keys present in one locale but not the other, English fallbacks left in Arabic, RTL-unsafe layouts, and missing glossary entries. Prevents the most common bilingual drift bugs from reaching CI.
---

# madar-i18n-sync

The tenant app ships in **English and Arabic from day one**, with RTL. Per `CLAUDE.md`: "No hardcoded strings in either app. Lint rule enforces." Treat AR as a first-class citizen — never an afterthought.

The admin app is English-only for now (internal tool), so this skill scopes to `apps/web`.

## Run

```bash
# Diff key sets
node -e '
const en = require("./apps/web/messages/en.json");
const ar = require("./apps/web/messages/ar.json");
const flat = (o, p="") => Object.entries(o).flatMap(([k,v]) =>
  typeof v === "object" && v !== null ? flat(v, p+k+".") : [p+k]);
const enK = new Set(flat(en));
const arK = new Set(flat(ar));
const missingInAr = [...enK].filter(k => !arK.has(k));
const missingInEn = [...arK].filter(k => !enK.has(k));
console.log("missing in ar.json:", missingInAr);
console.log("missing in en.json:", missingInEn);
'
```

Add this as `pnpm i18n:check` in `apps/web/package.json` so CI fails on drift.

## Checks

### 1. Key parity

Every key in `en.json` must exist in `ar.json` and vice versa. Missing keys → CI fails.

### 2. Untranslated fallbacks

A common bug: someone copies a key in but forgets to translate. Detect by comparing strings: if `ar[k] === en[k]` AND `en[k]` contains Latin letters AND `en[k].length > 3`, the AR value is almost certainly English left in by mistake.

```bash
node -e '
const en = require("./apps/web/messages/en.json");
const ar = require("./apps/web/messages/ar.json");
const flat = (o, p="") => Object.entries(o).reduce((a,[k,v]) => {
  if (typeof v === "object" && v !== null) Object.assign(a, flat(v, p+k+"."));
  else a[p+k] = v;
  return a;
}, {});
const E = flat(en), A = flat(ar);
const suspicious = Object.keys(E).filter(k => A[k] === E[k] && /[A-Za-z]{3,}/.test(E[k]));
console.log("suspected untranslated:", suspicious);
'
```

Exceptions: brand names (e.g. "Madar"), currency codes, product SKUs. Flag for human review — don't auto-fix.

### 3. Hardcoded strings in code

Per `CLAUDE.md`: "No hardcoded strings in either app. Lint rule enforces." Until that lint rule is set up, scan manually:

```bash
# Look for JSX text nodes with English-looking content but no useTranslations() in the file
grep -rEn '>\s*[A-Z][a-z]{2,}[^<{]*<' apps/web/src 2>/dev/null | head -50
```

This is heuristic — review each hit. Strings that should be translated → move to `useTranslations()`. Strings that are not user-facing (URLs, technical labels in dev tools) → leave but consider extracting anyway for consistency.

### 4. ICU placeholders

If a string uses `{count}`, `{name}`, etc., both locales must use the SAME placeholder names. Arabic plural rules differ from English (zero, one, two, few, many, other) — use ICU plural syntax:

```json
{
  "cart": {
    "items": "{count, plural, =0 {No items} one {1 item} other {# items}}"
  }
}
```

```json
{
  "cart": {
    "items": "{count, plural, =0 {لا توجد عناصر} one {عنصر واحد} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}"
  }
}
```

Flag any English key with a plural construct whose AR counterpart uses only `one` and `other` — Arabic needs all six.

### 5. RTL-unsafe layout

When a new component is added, check it for physical CSS properties:

```bash
grep -rEn '\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right|border-l|border-r)\b' apps/web/src --include="*.tsx" --include="*.ts" 2>/dev/null
```

Replace with logical: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `border-s`, `border-e`.

### 6. Numerals & dates

- Numbers via `Intl.NumberFormat` with the active locale. Never hand-format.
- Dates: storage always ISO 8601 UTC; display via `Intl.DateTimeFormat`.
- Arabic-Indic numerals (٠١٢٣) are opt-in per tenant setting — don't force.
- Hijri calendar is an opt-in tenant toggle — Gregorian by default.

```bash
grep -rEn '\.toLocaleString\(\)' apps/web/src 2>/dev/null
```

If you find `.toLocaleString()` without a locale argument, that's a latent bug — should be `.toLocaleString(locale)` or `formatNumber(value, locale)` from a shared helper.

### 7. Glossary

`docs/i18n-glossary.md` holds the canonical translations for product terms (Sale, Branch, Receipt, Pending verification, etc.). When you add a new term:
1. Check if it's already in the glossary.
2. If new, propose an entry and ask the user to approve.
3. Once approved, every future occurrence of that EN term must use the same AR translation.

```bash
test -f docs/i18n-glossary.md && echo "glossary exists" || echo "glossary missing — create it"
```

## Output format

```
i18n sync report (apps/web)
─────────────────────────────
Key parity:        OK
Untranslated:      3 suspected — features.aiDigest.headline, billing.payInvoice, ...
Hardcoded strings: 1 — src/app/[locale]/pos/page.tsx:42 ">Held<"
RTL-unsafe:        2 — components/Sidebar.tsx:18 (ml-4 → ms-4)
Plurals:           OK
Numerals:          OK
Glossary:          1 new term needs approval — "store credit"
```

## What NOT to do

- Don't machine-translate. AR translations need human review per `CLAUDE.md`.
- Don't add a key to `en.json` only and "fix the AR later". Ship both together or not at all.
- Don't suppress this skill on a feature branch to "unblock CI". The whole point is that AR ships in v1.
