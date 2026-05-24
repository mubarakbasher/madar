import type { EmailLocale, EmailTemplate } from "./email.types";

// Bilingual subject + body inlined here. Keeping templates in TS (rather than
// JSON loaded at runtime) means the build is dependency-free and the strings
// type-check against the var bag at each call site. Trade-off: adding a new
// language means editing each template; with 2 locales this is fine.

interface TemplateBundle {
  subject: Record<EmailLocale, string>;
  html: Record<EmailLocale, string>;
  text: Record<EmailLocale, string>;
}

const dir = (locale: EmailLocale) => (locale === "ar" ? "rtl" : "ltr");
const lang = (locale: EmailLocale) => locale;

function htmlShell(locale: EmailLocale, body: string): string {
  return `<!doctype html>
<html lang="${lang(locale)}" dir="${dir(locale)}">
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1A1714; max-width: 560px; margin: 0 auto; padding: 24px;">
${body}
<hr style="border: none; border-top: 1px solid #E8E4DD; margin: 32px 0;" />
<p style="font-size: 11px; color: #8A8478;">Madar — calm bilingual POS for retailers, restaurants, and pharmacies.</p>
</body>
</html>`;
}

const TEMPLATES: Record<EmailTemplate, TemplateBundle> = {
  welcome: {
    subject: {
      en: "Welcome to Madar — your trial has started",
      ar: "أهلاً بك في مدار — بدأت فترتك التجريبية",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 28px;">Welcome, {{ownerName}}.</h1>
<p>Your shop <strong>{{tenantName}}</strong> is live with a 14-day free trial until <strong>{{trialEndsAt}}</strong>.</p>
<p>Sign in to start adding your catalog and ringing up sales:</p>
<p><a href="{{ctaUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Open Madar</a></p>
<p>We'll send a reminder a few days before your trial ends.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 28px;">أهلاً، {{ownerName}}.</h1>
<p>متجرك <strong>{{tenantName}}</strong> جاهز للعمل مع فترة تجريبية مجانية لـ ١٤ يوماً حتى <strong>{{trialEndsAt}}</strong>.</p>
<p>سجِّل الدخول لبدء إضافة الكتالوج وإجراء المبيعات:</p>
<p><a href="{{ctaUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">افتح مدار</a></p>
<p>سنرسل تذكيراً قبل انتهاء الفترة التجريبية بأيام.</p>`,
      ),
    },
    text: {
      en: `Welcome to Madar, {{ownerName}}.

Your shop {{tenantName}} is live with a 14-day free trial until {{trialEndsAt}}.

Sign in: {{ctaUrl}}`,
      ar: `أهلاً بك في مدار، {{ownerName}}.

متجرك {{tenantName}} جاهز للعمل مع فترة تجريبية مجانية لـ ١٤ يوماً حتى {{trialEndsAt}}.

سجِّل الدخول: {{ctaUrl}}`,
    },
  },

  trial_ending: {
    subject: {
      en: "Your Madar trial ends in {{daysLeft}} days",
      ar: "تنتهي فترتك التجريبية في مدار خلال {{daysLeft}} أيام",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">{{daysLeft}} days left in your trial</h1>
<p>To keep <strong>{{tenantName}}</strong> running after the trial ends, settle your first invoice by bank transfer:</p>
<p><a href="{{payInvoiceUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Pay first invoice</a></p>
<p>Our finance team verifies bank transfers within 24 hours. You keep full access during verification.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">باقي {{daysLeft}} أيام في فترتك التجريبية</h1>
<p>لإبقاء <strong>{{tenantName}}</strong> يعمل بعد انتهاء التجربة، سدِّد أول فاتورة عبر التحويل البنكي:</p>
<p><a href="{{payInvoiceUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">ادفع الفاتورة الأولى</a></p>
<p>يتحقق فريق المالية لدينا من التحويلات خلال ٢٤ ساعة، وتبقى صلاحياتك كاملة أثناء التحقق.</p>`,
      ),
    },
    text: {
      en: `Your Madar trial for {{tenantName}} ends in {{daysLeft}} days.

Pay the first invoice: {{payInvoiceUrl}}`,
      ar: `تنتهي فترة مدار التجريبية لـ {{tenantName}} خلال {{daysLeft}} أيام.

ادفع الفاتورة الأولى: {{payInvoiceUrl}}`,
    },
  },

  payment_received: {
    subject: {
      en: "Payment received for {{referenceCode}}",
      ar: "تم استلام دفعة الفاتورة {{referenceCode}}",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Payment confirmed</h1>
<p>We've verified your transfer of <strong>{{amountFormatted}}</strong> against invoice <code>{{referenceCode}}</code> on {{paidAt}}.</p>
<p><strong>{{tenantName}}</strong> stays active. Thank you.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">تأكيد الدفعة</h1>
<p>تحققنا من تحويلك بقيمة <strong>{{amountFormatted}}</strong> مقابل الفاتورة <code>{{referenceCode}}</code> بتاريخ {{paidAt}}.</p>
<p><strong>{{tenantName}}</strong> يعمل بشكل اعتيادي. شكراً لك.</p>`,
      ),
    },
    text: {
      en: `Payment confirmed for invoice {{referenceCode}}: {{amountFormatted}} on {{paidAt}}.

{{tenantName}} stays active.`,
      ar: `تأكيد الدفعة لفاتورة {{referenceCode}}: {{amountFormatted}} بتاريخ {{paidAt}}.

{{tenantName}} يعمل بشكل اعتيادي.`,
    },
  },

  suspended: {
    subject: {
      en: "Your Madar subscription is suspended",
      ar: "تم تعليق اشتراكك في مدار",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">{{tenantName}} is now read-only</h1>
<p>We didn't receive payment for your overdue invoice, so <strong>{{tenantName}}</strong> was suspended on {{suspendedAt}}. You can still read your data, but new sales are blocked.</p>
<p>Pay your outstanding invoice to restore access:</p>
<p><a href="{{payInvoiceUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Pay outstanding invoice</a></p>
<p>If you need to leave Madar, you have until <strong>{{dataExportEndsAt}}</strong> to export your data.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">تم تحويل {{tenantName}} إلى وضع القراءة فقط</h1>
<p>لم نستلم دفعة الفاتورة المتأخرة، فتم تعليق <strong>{{tenantName}}</strong> بتاريخ {{suspendedAt}}. يمكنك قراءة بياناتك ولكن المبيعات الجديدة محظورة.</p>
<p>سدِّد فاتورتك المتأخرة لاستعادة الوصول:</p>
<p><a href="{{payInvoiceUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">سدِّد الفاتورة المتأخرة</a></p>
<p>إن كنت تريد مغادرة مدار، فأمامك حتى <strong>{{dataExportEndsAt}}</strong> لتصدير بياناتك.</p>`,
      ),
    },
    text: {
      en: `Madar suspended {{tenantName}} on {{suspendedAt}}. Pay outstanding invoice: {{payInvoiceUrl}}

Export deadline: {{dataExportEndsAt}}`,
      ar: `تم تعليق مدار لـ {{tenantName}} بتاريخ {{suspendedAt}}. سدِّد الفاتورة: {{payInvoiceUrl}}

موعد التصدير النهائي: {{dataExportEndsAt}}`,
    },
  },

  password_reset: {
    subject: {
      en: "Reset your Madar password",
      ar: "إعادة تعيين كلمة مرور مدار",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Reset your password</h1>
<p>Hi {{userName}}, we received a request to reset the password on your <strong>{{tenantName}}</strong> account.</p>
<p>Click below within <strong>{{expiresInHours}} hour(s)</strong> to set a new password:</p>
<p><a href="{{resetUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Reset password</a></p>
<p>If you didn't ask for this, you can safely ignore this email — your password is unchanged.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">إعادة تعيين كلمة المرور</h1>
<p>مرحباً {{userName}}، استلمنا طلباً لإعادة تعيين كلمة المرور لحسابك <strong>{{tenantName}}</strong>.</p>
<p>اضغط أدناه خلال <strong>{{expiresInHours}} ساعة</strong> لتعيين كلمة مرور جديدة:</p>
<p><a href="{{resetUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">إعادة تعيين كلمة المرور</a></p>
<p>إن لم تطلب ذلك، يمكنك تجاهل هذه الرسالة — كلمة مرورك لم تتغيّر.</p>`,
      ),
    },
    text: {
      en: `Reset your Madar password for {{tenantName}}: {{resetUrl}} (expires in {{expiresInHours}} hour(s))`,
      ar: `إعادة تعيين كلمة مرور مدار لـ {{tenantName}}: {{resetUrl}} (ينتهي خلال {{expiresInHours}} ساعة)`,
    },
  },

  email_verification: {
    subject: {
      en: "Confirm your email for Madar",
      ar: "تأكيد بريدك الإلكتروني لمدار",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Confirm your email</h1>
<p>Hi {{userName}}, please confirm your email so we can keep <strong>{{tenantName}}</strong> secure.</p>
<p>This link expires in <strong>{{expiresInHours}} hour(s)</strong>:</p>
<p><a href="{{verifyUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Verify email</a></p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">تأكيد بريدك الإلكتروني</h1>
<p>مرحباً {{userName}}، الرجاء تأكيد بريدك الإلكتروني للحفاظ على أمان <strong>{{tenantName}}</strong>.</p>
<p>ينتهي هذا الرابط خلال <strong>{{expiresInHours}} ساعة</strong>:</p>
<p><a href="{{verifyUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">تأكيد البريد</a></p>`,
      ),
    },
    text: {
      en: `Confirm your Madar email for {{tenantName}}: {{verifyUrl}} (expires in {{expiresInHours}} hour(s))`,
      ar: `أكّد بريد مدار لـ {{tenantName}}: {{verifyUrl}} (ينتهي خلال {{expiresInHours}} ساعة)`,
    },
  },

  staff_invite: {
    subject: {
      en: "You're invited to join {{tenantName}} on Madar",
      ar: "تمت دعوتك للانضمام إلى {{tenantName}} في مدار",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Welcome aboard, {{inviteeName}}</h1>
<p><strong>{{inviterName}}</strong> has invited you to join <strong>{{tenantName}}</strong> on Madar as <strong>{{role}}</strong>.</p>
<p>Set your password to get started — this invite expires on <strong>{{expiresAt}}</strong>:</p>
<p><a href="{{acceptUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Accept invite</a></p>
<p>If you weren't expecting this invite, you can ignore this email.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">أهلاً بك يا {{inviteeName}}</h1>
<p>دعاك <strong>{{inviterName}}</strong> للانضمام إلى <strong>{{tenantName}}</strong> في مدار بدور <strong>{{role}}</strong>.</p>
<p>عيّن كلمة المرور للبدء — تنتهي هذه الدعوة في <strong>{{expiresAt}}</strong>:</p>
<p><a href="{{acceptUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">قبول الدعوة</a></p>
<p>إن لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p>`,
      ),
    },
    text: {
      en: `{{inviterName}} invited you ({{inviteeName}}) to join {{tenantName}} on Madar as {{role}}.

Accept the invite:
{{acceptUrl}}

The invite expires on {{expiresAt}}.`,
      ar: `دعاك {{inviterName}} يا {{inviteeName}} للانضمام إلى {{tenantName}} في مدار بدور {{role}}.

اقبل الدعوة:
{{acceptUrl}}

تنتهي الدعوة في {{expiresAt}}.`,
    },
  },

  admin_invite: {
    subject: {
      en: "{{inviterName}} invited you to Madar admin",
      ar: "{{inviterName}} دعاك إلى إدارة مدار",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">You've been invited to Madar admin</h1>
<p><strong>{{inviterName}}</strong> invited you, {{inviteeName}}, to join the Madar super-admin team.</p>
<p>Accept the invite (expires {{expiresAt}}):</p>
<p><a href="{{acceptUrl}}" style="display: inline-block; padding: 12px 20px; background: #4A6B7A; color: white; border-radius: 8px; text-decoration: none;">Accept invitation</a></p>
<p>You'll need to set up two-factor authentication on first sign-in.</p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">تمت دعوتك إلى إدارة مدار</h1>
<p>دعاك <strong>{{inviterName}}</strong> يا {{inviteeName}} للانضمام إلى فريق الإدارة العليا في مدار.</p>
<p>اقبل الدعوة (تنتهي {{expiresAt}}):</p>
<p><a href="{{acceptUrl}}" style="display: inline-block; padding: 12px 20px; background: #4A6B7A; color: white; border-radius: 8px; text-decoration: none;">قبول الدعوة</a></p>
<p>سيُطلب منك إعداد المصادقة الثنائية عند تسجيل الدخول لأول مرة.</p>`,
      ),
    },
    text: {
      en: `{{inviterName}} invited you to Madar admin. Accept: {{acceptUrl}} (expires {{expiresAt}})`,
      ar: `{{inviterName}} دعاك إلى إدارة مدار. اقبل: {{acceptUrl}} (تنتهي {{expiresAt}})`,
    },
  },

  low_stock_alert: {
    subject: {
      en: "Low-stock alert · {{itemCount}} item(s) need reordering",
      ar: "تنبيه مخزون منخفض · {{itemCount}} صنف يحتاج إعادة طلب",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Low-stock alert</h1>
<p><strong>{{tenantName}}</strong> has <strong>{{itemCount}}</strong> products at or below their reorder point.</p>
<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
  <thead>
    <tr style="text-align: left; border-bottom: 1px solid #E8E4DD;">
      <th style="padding: 8px 4px;">SKU</th>
      <th style="padding: 8px 4px;">Product</th>
      <th style="padding: 8px 4px;">Branch</th>
      <th style="padding: 8px 4px; text-align: right;">On hand</th>
      <th style="padding: 8px 4px; text-align: right;">Reorder at</th>
    </tr>
  </thead>
  <tbody>{{itemsHtml}}</tbody>
</table>
<p style="font-size: 12px; color: #8A8478;">{{overflowNote}}</p>
<p><a href="{{inventoryUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Open inventory</a></p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">تنبيه مخزون منخفض</h1>
<p>لدى <strong>{{tenantName}}</strong> عدد <strong>{{itemCount}}</strong> من الأصناف وصلت أو تجاوزت حد إعادة الطلب.</p>
<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
  <thead>
    <tr style="text-align: right; border-bottom: 1px solid #E8E4DD;">
      <th style="padding: 8px 4px;">الكود</th>
      <th style="padding: 8px 4px;">المنتج</th>
      <th style="padding: 8px 4px;">الفرع</th>
      <th style="padding: 8px 4px; text-align: left;">الموجود</th>
      <th style="padding: 8px 4px; text-align: left;">حد الطلب</th>
    </tr>
  </thead>
  <tbody>{{itemsHtml}}</tbody>
</table>
<p style="font-size: 12px; color: #8A8478;">{{overflowNote}}</p>
<p><a href="{{inventoryUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">افتح المخزون</a></p>`,
      ),
    },
    text: {
      en: `Low-stock alert for {{tenantName}} — {{itemCount}} item(s) need reordering.

{{itemsText}}

{{overflowNote}}

Open inventory: {{inventoryUrl}}`,
      ar: `تنبيه مخزون منخفض لـ {{tenantName}} — {{itemCount}} صنف يحتاج إعادة طلب.

{{itemsText}}

{{overflowNote}}

افتح المخزون: {{inventoryUrl}}`,
    },
  },

  payment_proof_rejected: {
    subject: {
      en: "Payment proof for {{amountFormatted}} was not accepted",
      ar: "لم يتم قبول إثبات الدفع بمبلغ {{amountFormatted}}",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">Payment proof not accepted</h1>
<p>Your payment proof for <strong>{{amountFormatted}}</strong> at <strong>{{tenantName}}</strong> was not accepted.</p>
<p><strong>Reason:</strong> {{rejectionReason}}</p>
<p>You can resubmit a new proof with a corrected receipt:</p>
<p><a href="{{resubmitUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">Resubmit proof</a></p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">لم يتم قبول إثبات الدفع</h1>
<p>لم يتم قبول إثبات الدفع الخاص بك بمبلغ <strong>{{amountFormatted}}</strong> في <strong>{{tenantName}}</strong>.</p>
<p><strong>السبب:</strong> {{rejectionReason}}</p>
<p>يمكنك إعادة تقديم إثبات جديد بإيصال صحيح:</p>
<p><a href="{{resubmitUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">إعادة تقديم الإثبات</a></p>`,
      ),
    },
    text: {
      en: `Payment proof for {{amountFormatted}} at {{tenantName}} was not accepted.

Reason: {{rejectionReason}}

Resubmit a new proof: {{resubmitUrl}}`,
      ar: `لم يتم قبول إثبات الدفع بمبلغ {{amountFormatted}} في {{tenantName}}.

السبب: {{rejectionReason}}

إعادة تقديم إثبات جديد: {{resubmitUrl}}`,
    },
  },

  payment_proof_info_requested: {
    subject: {
      en: "More information needed for your payment of {{amountFormatted}}",
      ar: "مطلوب مزيد من المعلومات بخصوص دفعتك بمبلغ {{amountFormatted}}",
    },
    html: {
      en: htmlShell(
        "en",
        `<h1 style="font-family: Fraunces, Georgia, serif; font-size: 26px;">More information needed</h1>
<p>We need more information about your payment of <strong>{{amountFormatted}}</strong> at <strong>{{tenantName}}</strong>.</p>
<p><strong>Message from verifier:</strong> {{message}}</p>
<p>View your proof to respond:</p>
<p><a href="{{proofUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">View proof</a></p>`,
      ),
      ar: htmlShell(
        "ar",
        `<h1 style="font-family: 'IBM Plex Serif Arabic', Georgia, serif; font-size: 26px;">مطلوب مزيد من المعلومات</h1>
<p>نحتاج مزيداً من المعلومات حول دفعتك بمبلغ <strong>{{amountFormatted}}</strong> في <strong>{{tenantName}}</strong>.</p>
<p><strong>رسالة من المراجع:</strong> {{message}}</p>
<p>اعرض إثبات الدفع للرد:</p>
<p><a href="{{proofUrl}}" style="display: inline-block; padding: 12px 20px; background: #C96442; color: white; border-radius: 8px; text-decoration: none;">عرض الإثبات</a></p>`,
      ),
    },
    text: {
      en: `More information is needed about your payment of {{amountFormatted}} at {{tenantName}}.

Message from verifier: {{message}}

View your proof: {{proofUrl}}`,
      ar: `مطلوب مزيد من المعلومات حول دفعتك بمبلغ {{amountFormatted}} في {{tenantName}}.

رسالة من المراجع: {{message}}

عرض الإثبات: {{proofUrl}}`,
    },
  },

  // ─── raw ────────────────────────────────────────────────────────────
  // Sentinel bundle for `EmailService.sendRaw()` — these emails carry an
  // already-rendered subject/html/text supplied by the caller, so the
  // template bundle is intentionally empty. `renderTemplate` should never be
  // invoked for "raw" in practice; this bundle exists only to satisfy the
  // `Record<EmailTemplate, TemplateBundle>` type constraint.
  raw: {
    subject: { en: "", ar: "" },
    html: { en: "", ar: "" },
    text: { en: "", ar: "" },
  },
};

function interpolate(str: string, vars: Record<string, unknown>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

export function renderTemplate(
  template: EmailTemplate,
  locale: EmailLocale,
  vars: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const bundle = TEMPLATES[template];
  return {
    subject: interpolate(bundle.subject[locale], vars),
    html: interpolate(bundle.html[locale], vars),
    text: interpolate(bundle.text[locale], vars),
  };
}
