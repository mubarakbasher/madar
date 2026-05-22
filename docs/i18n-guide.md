# i18n-guide.md — Internationalization and Translation Workflow

How we handle English and Arabic in the platform, including the translation workflow, RTL conventions, and a domain-term glossary to keep translations consistent.

> **Companion documents:** `CLAUDE.md` (i18n rules), `design-system.md` (RTL design), `architecture.md` (i18n implementation).

---

## 1. Principles

1. **Arabic is not a translation — it's a first-class language.** Build every screen with both languages in mind. RTL is not a postprocessing step.
2. **Set up i18n before any UI work.** It is the second item in the build sequence for a reason. Retrofitting RTL into an LTR app means rewriting every component.
3. **No hardcoded strings, ever.** Even "OK" and "Cancel." A lint rule enforces this.
4. **Consistency over creativity.** Domain terms have one canonical Arabic translation (see glossary, section 9). Translators do not invent new terms.
5. **Numbers, dates, and currency formatting use `Intl`.** Never hand-format.

---

## 2. Languages and Scope

### 2.1 Tenant app (`apps/web`)

- **English** — primary source of truth.
- **Arabic** — full parity with English. All UI strings, error messages, emails, receipts, and product data.

### 2.2 Super-admin app (`apps/admin`)

- **English only** in v1. Internal tool, no Arabic UI.
- Structure preserved (`messages/en.json`) so Arabic can be added later without refactoring.

### 2.3 Future languages

Architecture supports adding more languages without code changes:
- Add `messages/{locale}.json`.
- Add to supported locales list in config.
- Add font fallbacks if non-Latin script.

Likely future additions: French, Turkish, Urdu — depending on market expansion.

---

## 3. Technical Setup

### 3.1 Frontend (`next-intl`)

Files:
```
apps/web/messages/
├── en.json
└── ar.json
```

Locale routing:
```
apps/web/src/app/[locale]/
├── (auth)/
├── pos/
├── inventory/
└── ...
```

Locale detection:
1. URL segment `/en` or `/ar`.
2. Cookie `NEXT_LOCALE`.
3. `Accept-Language` header.
4. Fallback: `en`.

Component usage:
```tsx
'use client';
import { useTranslations } from 'next-intl';

export function ProductCard({ product }) {
  const t = useTranslations('products');
  return (
    <div>
      <h3>{t('addToCart')}</h3>
      <button>{t('actions.save')}</button>
    </div>
  );
}
```

For server components:
```tsx
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('dashboard');
  return <h1>{t('title')}</h1>;
}
```

### 3.2 Backend (`nestjs-i18n`)

Files:
```
apps/api/src/i18n/
├── en/
│   ├── errors.json
│   ├── emails.json
│   └── receipts.json
└── ar/
    ├── errors.json
    ├── emails.json
    └── receipts.json
```

Locale resolution from request:
1. `Accept-Language` header.
2. Authenticated user's `locale` field on `users` table.
3. Tenant's primary `locale`.
4. Fallback: `en`.

Service usage:
```typescript
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class SaleService {
  constructor(private i18n: I18nService) {}

  async refund(saleId: string, lang: string) {
    if (!canRefund) {
      throw new BadRequestException(
        await this.i18n.translate('errors.refundNotAllowed', { lang })
      );
    }
  }
}
```

### 3.3 Database (translatable columns)

Use `jsonb` with shape `{ en: string, ar: string }`:

```sql
-- Product names support both languages
ALTER TABLE products ADD COLUMN name JSONB NOT NULL;
-- Example value: '{"en": "Coca-Cola 330ml", "ar": "كوكاكولا ٣٣٠ مل"}'

-- Default Arabic to English if not provided
CREATE OR REPLACE FUNCTION ensure_translatable(value JSONB)
RETURNS JSONB AS $$
BEGIN
  IF NOT (value ? 'en') THEN
    RAISE EXCEPTION 'English value required for translatable field';
  END IF;
  IF NOT (value ? 'ar') THEN
    value := jsonb_set(value, '{ar}', value->'en');
  END IF;
  RETURN value;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

Tables with translatable fields:
- `products.name`, `products.description`
- `categories.name`
- `tax_classes.name`
- `payment_methods.display_name`
- `unit_of_measure.name`, `unit_of_measure.abbreviation`
- `notification_templates.subject`, `notification_templates.body`
- `receipt_templates.header`, `receipt_templates.footer`
- `bank_accounts.bank_name`
- `branches.name`
- `tenants.business_name`

Query helper:
```typescript
function getLocalized(value: { en: string; ar?: string }, locale: 'en' | 'ar') {
  return value[locale] || value.en;
}
```

---

## 4. RTL Implementation

### 4.1 Document direction

The `dir` attribute on `<html>` flips by locale:

```tsx
// apps/web/src/app/[locale]/layout.tsx
export default function LocaleLayout({ children, params: { locale } }) {
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>{children}</body>
    </html>
  );
}
```

Browser handles direction-flipping for text and inline elements automatically; logical CSS properties handle the rest.

### 4.2 Logical CSS properties

**Always** use logical properties so the same component works in both directions:

| Physical (don't use) | Logical (use) |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `left: 0` | `inset-inline-start: 0` |

In Tailwind:

| Physical (don't use) | Logical (use) |
|---|---|
| `ml-4` | `ms-4` |
| `mr-4` | `me-4` |
| `pl-4` | `ps-4` |
| `pr-4` | `pe-4` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `border-l` | `border-s` |
| `border-r` | `border-e` |
| `left-0` | `start-0` |
| `right-0` | `end-0` |

A lint rule (`eslint-plugin-tailwindcss` with custom config) flags physical properties on changes.

### 4.3 Directional icons

Icons that imply a direction (arrows, chevrons, back/forward) must flip in RTL:

```tsx
import { ChevronRight, ArrowLeft } from 'lucide-react';

// ✅ Correct
<ChevronRight className="rtl:rotate-180" />
<ArrowLeft className="rtl:rotate-180" />

// ❌ Don't do this
<ChevronRight />  // points right in both directions, breaks navigation logic in RTL
```

Icons that **don't** flip (universally directional): pause, play (play points right by convention even in RTL contexts), search, check, X.

### 4.4 Forms

- Field labels above inputs — they read correctly in both directions without manual flipping.
- Input text alignment: `text-start` (flips automatically).
- Currency inputs: prefix vs. suffix handled by `Intl.NumberFormat`, not manually placed.

### 4.5 Tables

- Header alignment: text starts in the reading direction. Numbers right-aligned in LTR, left-aligned in RTL — use `text-end` for number columns (auto-flips).
- Sort indicators: chevron-down for both directions (vertical, no flip needed).

### 4.6 Receipts

Receipts can be printed in `en`, `ar`, or `both` per branch setting:

- **English receipt:** standard left-to-right layout.
- **Arabic receipt:** full RTL — header on the right, totals on the left.
- **Bilingual:** English content on top, Arabic mirrored below each line item. Total line shown in both currencies if applicable.

The thermal printer driver handles UTF-8 with Arabic shaping; test on real hardware (58mm and 80mm) for both languages.

---

## 5. Numbers, Dates, Currency

### 5.1 Numerals

- **Default:** Western digits (1, 2, 3) for all users, regardless of locale.
- **Optional Arabic-Indic** (١، ٢، ٣) — a tenant setting toggles display only. **Never** stored in DB, **never** sent over API.
- Implementation:

```typescript
function formatNumber(value: number, locale: 'en' | 'ar', useArabicIndic: boolean) {
  return new Intl.NumberFormat(
    locale === 'ar' && useArabicIndic ? 'ar-EG' : 'en-US'
  ).format(value);
}
```

### 5.2 Dates

- **Storage:** always ISO 8601 UTC in PostgreSQL (`TIMESTAMPTZ`).
- **Display:** locale-formatted using `Intl.DateTimeFormat`.
- **Calendar:** Gregorian default. Tenant setting opt-in to Hijri display:

```typescript
import dayjs from 'dayjs';
import 'dayjs/plugin/hijri';

function formatDate(date: Date, locale: 'en' | 'ar', useHijri: boolean) {
  if (useHijri) {
    return dayjs(date).format('iYYYY/iMM/iDD');
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(date);
}
```

### 5.3 Currency

- **Storage:** integer minor units (cents) in `bigint`, sibling `currency_code` (ISO 4217).
- **Display:** `Intl.NumberFormat` with the right locale.
- Currency symbol position handled automatically by `Intl`:

```typescript
const money = new Intl.NumberFormat('ar-SA', {
  style: 'currency',
  currency: 'SAR'
}).format(19.99);
// "١٩٫٩٩ ر.س." in ar-SA (symbol after)

const money2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(19.99);
// "$19.99" in en-US (symbol before)
```

### 5.4 Time

- 12-hour by default in English.
- 24-hour by default in Arabic.
- User can override in profile settings.

---

## 6. Search

PostgreSQL full-text search configured per language:

```sql
-- English
SELECT * FROM products
WHERE to_tsvector('english', name->>'en') @@ plainto_tsquery('english', $1);

-- Arabic — note: ar uses 'simple' or installed Arabic stemmer
SELECT * FROM products
WHERE to_tsvector('arabic', name->>'ar') @@ plainto_tsquery('arabic', $1);
```

For Arabic, install the `pg_arabic` extension or use `simple` config with custom normalization (strip diacritics, normalize alef variations).

Each product is indexed in both languages. The query uses the user's current locale's config.

```sql
CREATE INDEX idx_products_search_en
  ON products USING GIN (to_tsvector('english', name->>'en'));
CREATE INDEX idx_products_search_ar
  ON products USING GIN (to_tsvector('arabic', name->>'ar'));
```

---

## 7. Translation Workflow

### 7.1 Source of truth

`apps/web/messages/en.json` is the source. All other languages derive from it.

Structure:
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Are you sure?"
  },
  "auth": {
    "login": {
      "title": "Welcome back",
      "submit": "Sign in",
      "forgot": "Forgot password?"
    }
  },
  "products": {
    "title": "Products",
    "addToCart": "Add to cart",
    "outOfStock": "Out of stock"
  }
}
```

Use nested namespaces by feature, never a flat dictionary.

### 7.2 Adding a new string

1. Add to `en.json` under the appropriate namespace.
2. Add to `ar.json` with the translation, consulting the glossary (section 9).
3. Use in component via `useTranslations()`.
4. Visual regression check in both languages.

### 7.3 CI validation

```bash
pnpm i18n:check
```

This script:
- Loads `en.json` and `ar.json`.
- Asserts every key in `en.json` has a corresponding key in `ar.json`.
- Asserts no `ar.json` key is missing from `en.json` (orphan).
- Asserts no key has an empty Arabic value.
- Fails CI if any check fails.

### 7.4 Hardcoded string detection

```bash
pnpm i18n:extract
```

This script:
- Scans all `.tsx` files for string literals in JSX.
- Filters out known acceptable strings (variable names, CSS classes, etc.).
- Outputs unwrapped strings as a report.

The expected output is **empty**. Any hits are bugs.

### 7.5 Translator workflow (non-developer)

For domain translators (not engineers):
1. Receive a spreadsheet export: key, English source, current Arabic, notes.
2. Edit Arabic column.
3. Submit back.
4. Engineer reviews and merges to `ar.json`.

We do not use a translation management system (TMS) in v1 — JSON in git is sufficient. Phase 4 may add Crowdin or Lokalise if volume grows.

### 7.6 Machine translation policy

- **Never ship machine-translated user-facing strings without human review.**
- Acceptable for first-pass drafts on bulk additions.
- Domain terms (SKU, PO, RMA, etc.) must use the glossary, not MT output.
- Receipts, error messages, legal text, and emails are highest-priority for human review.

---

## 8. Bilingual Data Entry

Some user-generated content needs both languages — products, categories, branches.

### 8.1 UI pattern

For translatable fields in forms, show two tabs (or two stacked inputs):

```
[ EN ] [ AR ]
┌─────────────────────────────┐
│ Product name (English)      │
│ ┌─────────────────────────┐ │
│ │ Coca-Cola 330ml         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### 8.2 Auto-translate option (Phase 2+)

A button: "Copy from English" or "Auto-translate from English" — uses a translation API to suggest the Arabic version, which the user reviews before saving. Never auto-applied silently.

### 8.3 Fallback behavior

If a tenant fills only English, the Arabic field defaults to the English text (the DB function `ensure_translatable` handles this). The UI displays English content even to Arabic-locale users in this case, with a small "translation missing" hint to the tenant (visible only to them).

---

## 9. Arabic Glossary for Domain Terms

This glossary keeps translations consistent across the platform. Translators must use these canonical Arabic equivalents.

### 9.1 Core retail / POS terms

| English | Arabic | Notes |
|---|---|---|
| Sale | عملية بيع | Use for the transaction; "بيع" alone means selling generally. |
| Sell / Selling | بيع | Verb form. |
| Cart | السلة | Same as e-commerce term. |
| Receipt | إيصال | Standard. Plural: إيصالات. |
| Invoice | فاتورة | Distinct from receipt: invoice is pre-payment, receipt is post. |
| Refund | استرداد | "إرجاع" (return) refers to goods; "استرداد" refers to money. |
| Return (goods) | إرجاع | The act of returning physical goods. |
| Discount | خصم | Standard. |
| Tax | ضريبة | Plural: ضرائب. |
| VAT | ضريبة القيمة المضافة | Full term; abbreviated as ض.ق.م. in receipts. |
| Subtotal | المجموع الفرعي | Before tax. |
| Total | الإجمالي | After tax and discounts. |
| Change (cash) | الباقي | Money returned to customer. |
| Cashier | أمين الصندوق | The person operating the register. |
| Register / Till | الصندوق | The physical cash register. |
| Shift | وردية | "نوبة" is also used but less common in retail. |
| Open shift | فتح الوردية | |
| Close shift | إغلاق الوردية | |
| Cash float | رصيد افتتاحي | Opening cash amount. |
| Cash variance | فرق الصندوق | Difference between expected and counted cash. |

### 9.2 Inventory terms

| English | Arabic | Notes |
|---|---|---|
| Inventory | المخزون | Standard. |
| Stock | المخزون | Same as inventory in most contexts. |
| Product | منتج | Plural: منتجات. |
| SKU | وحدة حفظ المخزون | Use the abbreviation "SKU" in technical contexts; full term in user-facing settings. |
| Variant | نوع | More natural than "متغير". |
| Category | فئة | Plural: فئات. |
| Barcode | الباركود | Loanword; "رمز شريطي" is correct but uncommon. |
| Cost | تكلفة | |
| Price | سعر | Plural: أسعار. |
| Margin | هامش الربح | |
| Profit | ربح | |
| Loss | خسارة | |
| On hand | المتوفر | "الموجود فعلياً" is more literal but "المتوفر" reads better in UI. |
| Available | المتاح | Distinct from on-hand: available = on-hand minus reserved. |
| Reserved | محجوز | |
| Low stock | مخزون منخفض | |
| Out of stock | نفد المخزون | Or "غير متوفر" for shorter contexts. |
| Reorder | إعادة الطلب | |
| Reorder point | حد إعادة الطلب | The threshold quantity. |
| Stock movement | حركة المخزون | |
| Stock transfer | تحويل المخزون | Between branches. |
| Stock take | جرد المخزون | Full count. |
| Cycle count | جرد دوري | Partial periodic count. |
| Adjustment | تعديل | Manual correction. |
| Write-off | شطب | Removing damaged/lost stock. |

### 9.3 Branches and suppliers

| English | Arabic | Notes |
|---|---|---|
| Branch | فرع | Plural: فروع. |
| Supplier / Vendor | المورد | Plural: الموردون. |
| Purchase order (PO) | أمر شراء | |
| Goods receipt | استلام البضائع | |
| RMA (Return to vendor) | إرجاع للمورد | |
| Lead time | مدة التوريد | Days from order to delivery. |
| Fill rate | معدل التوريد | Percent of order fulfilled. |
| On-time delivery | التسليم في الموعد | |

### 9.4 People and roles

| English | Arabic | Notes |
|---|---|---|
| Owner | المالك | Business owner. |
| Manager | المدير | |
| Branch manager | مدير الفرع | |
| Cashier | أمين الصندوق | (already in retail terms) |
| Supervisor | المشرف | |
| Accountant | المحاسب | |
| Auditor | المدقق | |
| Customer | العميل | Plural: العملاء. |
| User | المستخدم | System user. |
| Employee | الموظف | |
| Permission | صلاحية | Plural: صلاحيات. |
| Role | دور | Plural: أدوار. |

### 9.5 Financial / billing

| English | Arabic | Notes |
|---|---|---|
| Subscription | الاشتراك | |
| Plan | الباقة | Standard for SaaS plans. |
| Trial | الفترة التجريبية | |
| Free trial | فترة تجريبية مجانية | |
| Billing | الفوترة | |
| Invoice | فاتورة | (also in retail terms) |
| Payment | الدفع | "الدفعة" for a specific payment instance. |
| Bank transfer | تحويل بنكي | |
| Cash | نقدي | When referring to method. "نقد" as noun. |
| Card | بطاقة | |
| Store credit | رصيد المتجر | |
| Receipt (proof of payment) | إيصال الدفع | More specific than just "إيصال". |
| Verification | التحقق | |
| Verified | تم التحقق | |
| Rejected | مرفوض | |
| Pending | قيد المراجعة | More natural than "معلق". |
| Approved | معتمد | |

### 9.6 Reporting and analysis

| English | Arabic | Notes |
|---|---|---|
| Report | تقرير | Plural: تقارير. |
| Dashboard | لوحة التحكم | |
| Revenue | الإيرادات | |
| Sales (the metric) | المبيعات | |
| Gross profit | إجمالي الربح | |
| Net profit | صافي الربح | |
| COGS | تكلفة البضائع المباعة | Abbreviated "ت.ب.م" in compact contexts. |
| Trend | الاتجاه | |
| Comparison | مقارنة | |
| Growth | النمو | |
| Decline | الانخفاض | |

### 9.7 UI actions

| English | Arabic | Notes |
|---|---|---|
| Save | حفظ | |
| Cancel | إلغاء | |
| Delete | حذف | |
| Archive | أرشفة | |
| Edit | تعديل | |
| Add | إضافة | |
| Remove | إزالة | Less destructive than "حذف". |
| Search | بحث | |
| Filter | تصفية | |
| Sort | ترتيب | |
| Export | تصدير | |
| Import | استيراد | |
| Print | طباعة | |
| Download | تنزيل | |
| Upload | رفع | |
| Submit | إرسال | |
| Continue | متابعة | |
| Back | رجوع | |
| Next | التالي | |
| Previous | السابق | |
| Done | تم | |
| OK | موافق | |
| Yes | نعم | |
| No | لا | |
| Loading | جارٍ التحميل | Note the diacritic on جارٍ. |
| Saving | جارٍ الحفظ | |
| Success | تم بنجاح | |
| Error | خطأ | |
| Warning | تحذير | |
| Information | معلومات | |

### 9.8 Status terms

| English | Arabic |
|---|---|
| Active | نشط |
| Inactive | غير نشط |
| Suspended | معلق |
| Cancelled | ملغى |
| Paid | مدفوع |
| Unpaid | غير مدفوع |
| Overdue | متأخر السداد |
| Draft | مسودة |
| Published | منشور |
| Open | مفتوح |
| Closed | مغلق |
| In transit | قيد النقل |
| Received | مستلم |
| Disputed | متنازع عليه |

### 9.9 Tone

- **Formal but warm.** Modern Standard Arabic (MSA), not regional dialect.
- **Active voice preferred** where natural.
- **Avoid English loanwords** when a clear Arabic equivalent exists; **embrace them** when the loanword is universally understood (e.g., "باركود" is more recognizable than "رمز شريطي").
- **Numbers in body text:** use words for one through ten only in prose contexts; digits everywhere else.

---

## 10. Testing i18n

### 10.1 Automated

- **`pnpm i18n:check`** — runs in CI on every PR.
- **`pnpm test:rtl`** — visual regression in RTL mode for every page.
- **`pnpm test:e2e`** — every E2E flow runs twice: once in `/en`, once in `/ar`.

### 10.2 Manual

Quarterly review by a native Arabic speaker familiar with retail terminology:
- Read through every screen.
- Confirm tone is professional and consistent.
- Check Arabic typography (Diacritics, ligatures, alignment).
- Verify thermal-printer receipts render correctly.

---

## 11. Common Pitfalls

### 11.1 Pluralization

Arabic has more grammatical numbers than English (singular, dual, plural, plural-of-many). `next-intl` supports ICU MessageFormat which handles this:

```json
{
  "products.count": "{count, plural, =0{No products} =1{One product} =2{Two products} few{# products} many{# products} other{# products}}"
}
```

```json
{
  "products.count": "{count, plural, =0{لا توجد منتجات} =1{منتج واحد} =2{منتجان} few{# منتجات} many{# منتجاً} other{# منتج}}"
}
```

Always test plural forms for 0, 1, 2, 3, 11, 100.

### 11.2 Gender

Arabic verbs and adjectives change form based on subject gender. For UI strings that refer to "you" (the user), pick a default gender (typically masculine in formal MSA) and stick with it. If the platform later supports gender preference in user settings, message keys can branch.

### 11.3 Text expansion

Arabic translations of English text are often **20–30% longer** by character count. Design must accommodate this:
- Don't pin button widths to English text lengths.
- Allow text to wrap or truncate gracefully.
- Test long Arabic strings in narrow containers during design review.

### 11.4 Bidirectional content

Mixed-direction strings (Arabic with embedded English brand names or numbers) need careful handling. Use Unicode bidi control marks if needed:

```
عربي ‎English text‎ عربي
```

For most cases, native browser handling is correct. Test edge cases like currency amounts (numbers + Arabic symbol) and product names (mixed scripts).

### 11.5 Fonts and rendering

- **Always specify Arabic font** in CSS (`--font-arabic`), don't rely on browser defaults.
- **Test thermal-printer rendering** specifically — many printers handle Arabic shaping poorly without explicit configuration.
- **Subset fonts** for performance (load only the characters you use).

---

## 12. Reference

- Translation files: `apps/web/messages/`
- Backend translations: `apps/api/src/i18n/`
- Domain term glossary: section 9 of this file
- Build tools: `pnpm i18n:check`, `pnpm i18n:extract`, `pnpm test:rtl`
- Design rules: `design-system.md` section 14
- Build conventions: `CLAUDE.md` i18n section
