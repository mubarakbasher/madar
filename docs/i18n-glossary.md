# i18n-glossary.md — Arabic Translation Glossary

The canonical English-to-Arabic glossary for domain terms used throughout the platform. **All translators must use these equivalents.** Adding new terms requires a PR review by someone with retail/POS domain knowledge.

> **Companion document:** `i18n-guide.md` for the broader translation workflow, RTL rules, and tooling.
>
> **This document is the source of truth for terminology.** If a translation in `apps/web/messages/ar.json` disagrees with this glossary, the glossary wins and the messages file gets corrected.

---

## How to Use This Glossary

1. **Before translating any new string,** check whether it contains a term in this glossary.
2. **Use the canonical Arabic exactly as listed.** No paraphrasing, no synonyms.
3. **If a term is missing,** propose an addition via PR, including context and any reasoning.
4. **For ambiguous cases,** check the Notes column — many English terms have multiple Arabic equivalents depending on context.

---

## 1. Core Retail / POS Terms

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
| Hold / Park sale | تعليق البيع | Set aside a sale temporarily. |
| Void | إلغاء | Cancel a transaction before payment. |
| Tender | وسيلة الدفع | The means of payment. |
| Split tender | دفع مقسم | Paying with multiple methods. |

---

## 2. Inventory Terms

| English | Arabic | Notes |
|---|---|---|
| Inventory | المخزون | Standard. |
| Stock | المخزون | Same as inventory in most contexts. |
| Product | منتج | Plural: منتجات. |
| Item | صنف | Sometimes interchangeable with product; "صنف" leans more to "item type". |
| SKU | وحدة حفظ المخزون | Use the abbreviation "SKU" in technical contexts; full term in user-facing settings. |
| Variant | نوع | More natural than "متغير". |
| Category | فئة | Plural: فئات. |
| Brand | علامة تجارية | |
| Barcode | الباركود | Loanword; "رمز شريطي" is correct but uncommon. |
| Unit of measure | وحدة القياس | |
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
| In stock | متوفر | |
| Reorder | إعادة الطلب | |
| Reorder point | حد إعادة الطلب | The threshold quantity. |
| Reorder quantity | كمية إعادة الطلب | |
| Stock movement | حركة المخزون | |
| Stock transfer | تحويل المخزون | Between branches. |
| Stock take | جرد المخزون | Full count. |
| Cycle count | جرد دوري | Partial periodic count. |
| Adjustment | تعديل | Manual correction. |
| Write-off | شطب | Removing damaged/lost stock. |
| Damage | تلف | |
| Expiry | انتهاء الصلاحية | |
| Batch | دفعة | |
| Serial number | الرقم التسلسلي | |

---

## 3. Branches and Suppliers

| English | Arabic | Notes |
|---|---|---|
| Branch | فرع | Plural: فروع. |
| Location | موقع | When more general than branch. |
| Warehouse | مستودع | |
| Supplier / Vendor | المورد | Plural: الموردون. |
| Purchase order (PO) | أمر شراء | |
| Goods receipt | استلام البضائع | |
| RMA (Return to vendor) | إرجاع للمورد | |
| Lead time | مدة التوريد | Days from order to delivery. |
| Fill rate | معدل التوريد | Percent of order fulfilled. |
| On-time delivery | التسليم في الموعد | |
| Payment terms | شروط الدفع | |
| Net 30 / Net 60 | صافي ٣٠ / صافي ٦٠ | Use digits, not words. |
| Credit limit | حد الائتمان | |

---

## 4. People and Roles

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
| Staff | الموظفون | Collective. |
| Permission | صلاحية | Plural: صلاحيات. |
| Role | دور | Plural: أدوار. |
| Administrator | المدير العام | For top-level admin. |

---

## 5. Financial / Billing

| English | Arabic | Notes |
|---|---|---|
| Subscription | الاشتراك | |
| Plan | الباقة | Standard for SaaS plans. |
| Trial | الفترة التجريبية | |
| Free trial | فترة تجريبية مجانية | |
| Billing | الفوترة | |
| Invoice | فاتورة | (also in retail terms) |
| Payment | الدفع | "الدفعة" for a specific payment instance. |
| Payment method | وسيلة الدفع | |
| Bank transfer | تحويل بنكي | |
| Cash | نقدي | When referring to method. "نقد" as noun. |
| Card | بطاقة | |
| Credit card | بطاقة ائتمان | |
| Store credit | رصيد المتجر | |
| Receipt (proof of payment) | إيصال الدفع | More specific than just "إيصال". |
| Bank reference | المرجع البنكي | Transaction reference from the bank. |
| Bank account | حساب بنكي | |
| IBAN | رقم الآيبان | Or full "رقم الحساب المصرفي الدولي". |
| Verification | التحقق | |
| Verified | تم التحقق | |
| Rejected | مرفوض | |
| Pending | قيد المراجعة | More natural than "معلق". |
| Approved | معتمد | |
| Submitted | تم الإرسال | |
| Awaiting payment | بانتظار الدفع | |
| Past due | متأخر السداد | |
| Grace period | فترة السماح | |
| Suspended | معلق | |
| Cancelled | ملغى | |
| Auto-renewal | تجديد تلقائي | |
| Renewal | تجديد | |
| Cycle | دورة | Billing cycle. |
| Currency | عملة | Plural: عملات. |

---

## 6. Reporting and Analysis

| English | Arabic | Notes |
|---|---|---|
| Report | تقرير | Plural: تقارير. |
| Dashboard | لوحة التحكم | |
| Revenue | الإيرادات | |
| Sales (the metric) | المبيعات | |
| Gross profit | إجمالي الربح | |
| Net profit | صافي الربح | |
| Gross margin | هامش الربح الإجمالي | |
| Net margin | هامش الربح الصافي | |
| COGS | تكلفة البضائع المباعة | Abbreviated "ت.ب.م" in compact contexts. |
| Trend | الاتجاه | |
| Comparison | مقارنة | |
| Growth | النمو | |
| Decline | الانخفاض | |
| Period | الفترة | |
| Year-over-year | سنوياً | "مقارنة بالعام الماضي" for fuller phrase. |
| Top sellers | الأكثر مبيعاً | |
| Slow movers | الأبطأ حركة | |
| Best performing | الأفضل أداءً | |
| KPI | مؤشر الأداء الرئيسي | |
| Forecast | توقع | |
| Average | المتوسط | |
| Average basket | متوسط السلة | |

---

## 7. UI Actions

| English | Arabic | Notes |
|---|---|---|
| Save | حفظ | |
| Cancel | إلغاء | |
| Delete | حذف | |
| Archive | أرشفة | |
| Unarchive | إلغاء الأرشفة | |
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
| Apply | تطبيق | |
| Reset | إعادة تعيين | |
| Clear | مسح | |
| Refresh | تحديث | |
| Update | تحديث | Same word as refresh in most UI contexts. |
| Loading | جارٍ التحميل | Note the diacritic on جارٍ. |
| Saving | جارٍ الحفظ | |
| Processing | جارٍ المعالجة | |
| Success | تم بنجاح | |
| Error | خطأ | |
| Warning | تحذير | |
| Information | معلومات | |
| Confirm | تأكيد | |
| Are you sure? | هل أنت متأكد؟ | |
| Close | إغلاق | |
| Open | فتح | |
| Select | اختر | Imperative. |
| Choose | اختيار | |
| Sign in | تسجيل الدخول | |
| Sign up | إنشاء حساب | |
| Sign out / Log out | تسجيل الخروج | |
| Forgot password | نسيت كلمة المرور | |
| Reset password | إعادة تعيين كلمة المرور | |

---

## 8. Status Terms

| English | Arabic |
|---|---|
| Active | نشط |
| Inactive | غير نشط |
| Enabled | مفعّل |
| Disabled | معطّل |
| Suspended | معلق |
| Cancelled | ملغى |
| Paid | مدفوع |
| Unpaid | غير مدفوع |
| Partially paid | مدفوع جزئياً |
| Overdue | متأخر السداد |
| Draft | مسودة |
| Published | منشور |
| Open | مفتوح |
| Closed | مغلق |
| In transit | قيد النقل |
| Received | مستلم |
| Disputed | متنازع عليه |
| Resolved | تم الحل |
| New | جديد |
| Returning | عائد |
| Completed | مكتمل |
| In progress | قيد التنفيذ |
| Failed | فشل |

---

## 9. Time and Dates

| English | Arabic |
|---|---|
| Today | اليوم |
| Yesterday | الأمس |
| Tomorrow | غداً |
| This week | هذا الأسبوع |
| Last week | الأسبوع الماضي |
| This month | هذا الشهر |
| Last month | الشهر الماضي |
| This year | هذا العام |
| Last year | العام الماضي |
| Last 7 days | آخر ٧ أيام |
| Last 30 days | آخر ٣٠ يوماً |
| Custom range | نطاق مخصص |
| From | من |
| To | إلى |
| Hour | ساعة |
| Day | يوم |
| Week | أسبوع |
| Month | شهر |
| Year | عام / سنة |

---

## 10. Notifications and Alerts

| English | Arabic |
|---|---|
| Notification | إشعار |
| Alert | تنبيه |
| Reminder | تذكير |
| Message | رسالة |
| Inbox | صندوق الوارد |
| Mark as read | وضع علامة مقروء |
| Mark as unread | وضع علامة غير مقروء |
| Dismiss | تجاهل |
| Snooze | تأجيل |

---

## 11. Tone Guidance

- **Formal but warm.** Modern Standard Arabic (MSA), not regional dialect.
- **Active voice preferred** where natural.
- **Avoid English loanwords** when a clear Arabic equivalent exists; **embrace them** when the loanword is universally understood (e.g., "باركود" is more recognizable than "رمز شريطي").
- **Numbers in body text:** use words for one through ten only in prose contexts; digits everywhere else.
- **Gender:** default to masculine forms for UI text addressing "you" (the user) — this is the formal MSA convention. If gender preference is added later, message keys will branch.
- **No exclamation marks** in informational text. Reserve for genuine celebration ("تمت العملية بنجاح!" is OK; "حفظ!" is not).

---

## 12. Common Pitfalls

### 12.1 Plurals

Arabic has more grammatical numbers than English. Use ICU MessageFormat:

```json
"products.count": "{count, plural, =0{لا توجد منتجات} =1{منتج واحد} =2{منتجان} few{# منتجات} many{# منتجاً} other{# منتج}}"
```

Always test 0, 1, 2, 3, 11, 100.

### 12.2 Text expansion

Arabic translations are often **20–30% longer** than English by character count. Buttons sized to fit English text may overflow in Arabic. Design accordingly.

### 12.3 Mixed-direction strings

When Arabic text contains embedded English brand names or numbers, native browser bidi handling is usually correct. Test edge cases like prices in mixed scripts.

### 12.4 Diacritics

Don't add diacritics (ḥarakāt) to UI text unless they disambiguate a real word. They make text harder to read at small sizes and look cluttered. Exception: "جارٍ" (loading) where the kasra-tanwin is part of standard spelling.

---

## 13. Contributing to This Glossary

To add a term:

1. Open a PR adding the entry to the right section.
2. Include the English source, the proposed Arabic, and a Notes column explaining context or alternatives considered.
3. Tag a reviewer with retail/POS Arabic-language expertise.
4. Once merged, update any existing translations in `apps/web/messages/ar.json` that used a different rendering.

To change a term:

1. Open an issue first, explain the case for the change.
2. After discussion, open a PR with the glossary update + all corresponding translation file updates in the same commit. Half-migrated terminology is worse than the old terminology.

---

## 14. Reference

- Translation workflow and tooling: `i18n-guide.md`
- Translation files: `apps/web/messages/`
- Validation: `pnpm i18n:check`
