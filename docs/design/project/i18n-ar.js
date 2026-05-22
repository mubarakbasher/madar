// Arabic translation overlay. Walks text nodes and swaps known phrases when
// document.dir === 'rtl'. Re-runs on DOM mutation.

(function () {
  const DICT = {
    // Sidebar / sections
    "Operations": "العمليات",
    "Network": "الشبكة",
    "Money": "المالية",
    "Dashboard": "لوحة التحكم",
    "Checkout": "الدفع",
    "Sales records": "سجلات المبيعات",
    "Inventory": "المخزون",
    "Stock transfers": "تحويلات المخزون",
    "Suppliers": "الموردون",
    "Purchase orders": "أوامر الشراء",
    "Branches": "الفروع",
    "Reconciliation": "التسوية",
    "Income & analysis": "الدخل والتحليلات",
    "Settings": "الإعدادات",
    "Help": "المساعدة",
    "Live": "مباشر",

    // Topbar
    "Live terminal": "نقطة بيع مباشرة",
    "Catalog & stock": "الكتالوج والمخزون",
    "Network · 6": "الشبكة · ٦",
    "5 locations": "٥ مواقع",
    "Weekly review": "المراجعة الأسبوعية",
    "Records · today": "سجلات · اليوم",
    "Between branches": "بين الفروع",
    "End of day": "نهاية اليوم",

    // Common
    "All branches": "جميع الفروع",
    "Today": "اليوم",
    "Export": "تصدير",
    "Cancel": "إلغاء",
    "Continue": "متابعة",
    "Back": "رجوع",
    "Done": "تم",
    "All": "الكل",
    "Cash": "نقدي",
    "Card": "بطاقة",
    "Transfer": "تحويل",
    "All status": "كل الحالات",
    "Pending": "معلق",
    "Verified": "موثق",
    "Why?": "لماذا؟",
    "Close day": "إغلاق اليوم",
    "Mark all read": "وضع علامة مقروء على الكل",
    "View all notifications": "عرض جميع الإشعارات",
    "Notifications": "الإشعارات",

    // Sales records
    "All transactions": "جميع المعاملات",
    "Ticket": "فاتورة",
    "Time": "الوقت",
    "Branch": "الفرع",
    "Cashier": "أمين الصندوق",
    "Items": "أصناف",
    "Method": "الطريقة",
    "Status": "الحالة",
    "Total": "المجموع",
    "tickets": "فواتير",
    "volume": "إجمالي",
    "pending verification": "بانتظار التوثيق",
    "ago": "مضت",
    "Select items to return": "اختر الأصناف للإرجاع",
    "Reason": "السبب",
    "Manager approval required": "يتطلب موافقة المدير",
    "Approve refund": "اعتماد الاسترداد",
    "Send for async review": "إرسال للمراجعة لاحقاً",
    "Refund processed": "تم الاسترداد",
    "Refund total (incl. tax)": "إجمالي الاسترداد (شامل الضريبة)",
    "Reprint receipt": "إعادة طباعة الإيصال",
    "Return / refund": "إرجاع / استرداد",
    "Email or SMS receipt": "بريد أو رسالة بإيصال",
    "Items": "الأصناف",
    "Subtotal": "المجموع الفرعي",
    "VAT 14%": "ضريبة ١٤٪",
    "Mark verified": "تأكيد التوثيق",
    "View receipt": "عرض الإيصال",
    "Bank receipt · pending": "إيصال بنكي · معلق",
    "Customer dissatisfied": "العميل غير راضٍ",
    "Wrong item served": "صنف خاطئ",
    "Quality issue": "مشكلة جودة",
    "Cashier error": "خطأ من الكاشير",
    "Other": "أخرى",
    "Select a reason…": "اختر سبباً…",
    "Continue ·": "متابعة ·",
    "item": "صنف",
    "items": "أصناف",

    // Purchase orders
    "Procurement": "المشتريات",
    "open": "مفتوحة",
    "committed": "ملتزمة",
    "AI-suggested": "اقتراح ذكاء اصطناعي",
    "New purchase order": "أمر شراء جديد",
    "Build PO": "إنشاء الأمر",
    "Draft": "مسودة",
    "Awaiting": "بانتظار",
    "In transit": "قيد النقل",
    "Received": "مستلم",
    "PO #": "رقم الأمر",
    "Supplier": "المورد",
    "Created": "تاريخ الإنشاء",
    "Due": "الاستحقاق",
    "Choose supplier": "اختر المورد",
    "Add items": "إضافة أصناف",
    "Review & send": "مراجعة وإرسال",
    "step": "خطوة",
    "of": "من",
    "Order summary": "ملخص الطلب",
    "Internal note": "ملاحظة داخلية",
    "Costs": "التكاليف",
    "Shipping": "الشحن",
    "Send to supplier": "إرسال للمورد",
    "Add line": "إضافة بند",
    "SKU": "الرمز",
    "Item": "الصنف",
    "Qty": "الكمية",
    "Cost": "التكلفة",
    "lead time": "زمن التوريد",
    "Expected delivery:": "التسليم المتوقع:",

    // Reconciliation
    "Cash drawers · 5": "أدراج النقد · ٥",
    "Bank receipts · 12 pending": "إيصالات بنكية · ١٢ معلق",
    "Discrepancies · 2": "تناقضات · ٢",
    "Drawer ·": "درج ·",
    "Cashier ·": "كاشير ·",
    "Expected (system)": "المتوقع (النظام)",
    "Counted": "المحسوب",
    "Difference": "الفارق",
    "✓ Tied": "✓ متطابق",
    "Short": "ناقص",
    "Over": "زائد",
    "Reason for discrepancy…": "سبب الفارق…",
    "Upload bank statement": "رفع كشف الحساب",
    "Auto-match": "مطابقة تلقائية",
    "Verify all matched": "توثيق جميع المطابق",
    "Reference": "المرجع",
    "Amount": "المبلغ",
    "Receipt": "الإيصال",
    "Action": "إجراء",
    "View": "عرض",
    "Verify": "توثيق",
    "Date": "التاريخ",
    "Type": "النوع",
    "By": "بواسطة",

    // Transfers
    "Inventory · transfers": "المخزون · تحويلات",
    "Move stock between branches. Both sides see the audit trail.":
      "نقل المخزون بين الفروع. كلا الطرفين يشاهد السجل.",
    "New transfer": "تحويل جديد",
    "Move stock between branches": "نقل مخزون بين فروع",
    "From": "من",
    "To": "إلى",
    "Pick items": "اختر الأصناف",
    "on hand": "متاح",
    "Transfer": "التحويل",
    "Units": "الوحدات",
    "Sent": "مُرسل",
    "Requested": "مطلوب",

    // Settings
    "Workspace settings": "إعدادات مساحة العمل",
    "Users & roles": "المستخدمون والأدوار",
    "Permissions matrix": "مصفوفة الصلاحيات",
    "Tax & currency": "الضريبة والعملة",
    "Hardware": "الأجهزة",
    "Data & backups": "البيانات والنسخ الاحتياطي",
    "Plan & billing": "الخطة والفوترة",
    "People with access": "المستخدمون المخولون",
    "Invite user": "دعوة مستخدم",
    "Name": "الاسم",
    "Role": "الدور",
    "MFA": "تحقق ثنائي",
    "Last active": "آخر نشاط",
    "Enabled": "مفعل",
    "Off": "معطل",
    "Permissions by role": "الصلاحيات حسب الدور",
    "Reports": "التقارير",
    "Users": "المستخدمون",
    "Refunds": "الاستردادات",
    "Full": "كاملة",
    "None": "لا شيء",
    "Owner": "المالك",
    "Admin": "مدير",
    "Branch Manager": "مدير فرع",
    "Cashier": "كاشير",
    "Inventory Clerk": "موظف مخزون",
    "Accountant": "محاسب",
    "Read-only Auditor": "مراجع للقراءة",

    // Onboarding
    "Tell us about your business": "أخبرنا عن عملك",
    "Add your first branch": "أضف فرعك الأول",
    "Import your products": "استورد منتجاتك",
    "Set tax & currency": "ضبط الضريبة والعملة",
    "You're ready": "جاهز للانطلاق",
    "Step": "خطوة",
    "Business name": "اسم العمل",
    "What do you sell?": "ماذا تبيع؟",
    "Café / coffee": "مقهى",
    "Restaurant": "مطعم",
    "Bakery": "مخبز",
    "Retail": "بيع بالتجزئة",
    "Salon": "صالون",
    "Gym": "نادي",
    "How many locations to start?": "كم موقعاً للبداية؟",
    "Branch name": "اسم الفرع",
    "Address": "العنوان",
    "Currency": "العملة",
    "Default language": "اللغة الافتراضية",
    "Hours": "ساعات العمل",
    "VAT rate": "نسبة الضريبة",
    "Receipt prefix": "بادئة الإيصال",
    "Accept payment via": "قبول الدفع عبر",
    "Card terminal": "جهاز بطاقات",
    "Bank transfer": "تحويل بنكي",
    "Voucher": "قسيمة",
    "Connect printer & scanner": "وصّل الطابعة والماسح",
    "Detect printer": "اكتشاف طابعة",
    "Pair scanner": "إقران ماسح",
    "Take a tour": "جولة سريعة",
    "Open the app →": "افتح التطبيق ←",
    "Skip setup →": "تخطّ الإعداد ←",
    "14-day free trial · no card": "تجربة ١٤ يوم · بدون بطاقة",
    "to": "إلى",

    // Notifications
    "Yirgacheffe is low at Maadi & Heliopolis": "يرغاتشيف منخفض في المعادي ومصر الجديدة",
    "12 bank receipts awaiting verification": "١٢ إيصال بنكي بانتظار التوثيق",
    "Madar weekly digest is ready": "موجز مدار الأسبوعي جاهز",

    // Misc dashboards/headers
    "Mon · 8 May 2026": "الإثنين · ٨ مايو ٢٠٢٦",
    "Sales": "المبيعات",
    "Records · today": "سجلات · اليوم",
    "Transfers": "التحويلات",
    "Reconcile": "تسوية",
    "Income": "الدخل",
  };

  // Pre-build sorted keys (longest first) for greedy phrase matching
  const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);

  function translateText(text) {
    if (!text || !text.trim()) return text;
    let out = text;
    for (const k of KEYS) {
      if (out.indexOf(k) !== -1) {
        out = out.split(k).join(DICT[k]);
      }
    }
    return out;
  }

  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      if (t && t.trim()) {
        const tr = translateText(t);
        if (tr !== t) node.nodeValue = tr;
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    if (node.classList && node.classList.contains('tnum')) {
      // Skip numeric containers' children but still descend in case of mixed
    }
    // Translate placeholders too
    if (node.tagName === 'INPUT' && node.placeholder) {
      const tr = translateText(node.placeholder);
      if (tr !== node.placeholder) node.placeholder = tr;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }

  let active = false;
  let observer = null;
  let scheduled = false;

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (active) walk(document.body);
    });
  }

  function start() {
    if (active) return;
    active = true;
    walk(document.body);
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stop() {
    active = false;
    if (observer) { observer.disconnect(); observer = null; }
    // Force a reload to restore English — simplest correct behaviour
    location.reload();
  }

  function check() {
    const isAr = document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
    if (isAr && !active) start();
    else if (!isAr && active) stop();
  }

  // Watch for dir/lang attribute changes on <html>
  new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['dir', 'lang'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
