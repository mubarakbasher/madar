// Ported from docs/design/project/data.js — Bayt Coffee Co. (Cairo specialty coffee).
// Arabic name translations added inline; for items not in docs/design/project/i18n-ar.js
// nor docs/i18n-glossary.md, translated using domain knowledge (coffee-shop vocabulary).

export const BRANCHES = [
  { code: "maadi", name_en: "Maadi", name_ar: "المعادي", opened: "2022-01-01" },
  { code: "zamalek", name_en: "Zamalek", name_ar: "الزمالك", opened: "2021-01-01" },
  { code: "heliopolis", name_en: "Heliopolis", name_ar: "مصر الجديدة", opened: "2023-01-01" },
  { code: "newcairo", name_en: "New Cairo", name_ar: "القاهرة الجديدة", opened: "2024-01-01" },
  { code: "sheikhzayed", name_en: "Sheikh Zayed", name_ar: "الشيخ زايد", opened: "2024-01-01" },
];

export const PRODUCT_CATEGORIES = [
  { code: "espresso", name_en: "Espresso", name_ar: "إسبريسو", sort: 1 },
  { code: "pourover", name_en: "Pour-over", name_ar: "تقطير يدوي", sort: 2 },
  { code: "cold", name_en: "Cold drinks", name_ar: "مشروبات باردة", sort: 3 },
  { code: "beans", name_en: "Whole bean", name_ar: "بن كامل", sort: 4 },
  { code: "pastry", name_en: "Pastries", name_ar: "معجنات", sort: 5 },
  { code: "merch", name_en: "Merch", name_ar: "منتجات", sort: 6 },
];

// price/cost in whole EGP — multiply by 100 in seed for cents
export const PRODUCTS = [
  // Espresso
  { sku: "ESP-001", cat: "espresso", name_en: "Espresso",          name_ar: "إسبريسو",                 price: 35,  cost: 8,  stock: 240, low: 60 },
  { sku: "ESP-002", cat: "espresso", name_en: "Doppio",            name_ar: "دوبيو",                   price: 45,  cost: 10, stock: 180, low: 60 },
  { sku: "ESP-003", cat: "espresso", name_en: "Cortado",           name_ar: "كورتادو",                 price: 55,  cost: 14, stock: 120, low: 40 },
  { sku: "ESP-004", cat: "espresso", name_en: "Flat White",        name_ar: "فلات وايت",               price: 65,  cost: 16, stock: 96,  low: 40 },
  { sku: "ESP-005", cat: "espresso", name_en: "Cappuccino",        name_ar: "كابتشينو",                price: 65,  cost: 16, stock: 110, low: 40 },
  { sku: "ESP-006", cat: "espresso", name_en: "Latte",             name_ar: "لاتيه",                   price: 70,  cost: 17, stock: 88,  low: 40 },
  // Pour-over
  { sku: "POV-001", cat: "pourover", name_en: "Yirgacheffe V60",   name_ar: "يرغاتشيف V60",            price: 85,  cost: 22, stock: 22,  low: 30 },
  { sku: "POV-002", cat: "pourover", name_en: "Sidamo Pour-over",  name_ar: "سيدامو بالتقطير اليدوي",   price: 80,  cost: 21, stock: 34,  low: 30 },
  { sku: "POV-003", cat: "pourover", name_en: "Kenya AA Chemex",   name_ar: "كينيا AA كيمكس",          price: 95,  cost: 26, stock: 18,  low: 24 },
  { sku: "POV-004", cat: "pourover", name_en: "Geisha (single)",   name_ar: "جيشا (مفرد)",             price: 180, cost: 62, stock: 8,   low: 12 },
  // Cold
  { sku: "COL-001", cat: "cold",     name_en: "Iced Latte",        name_ar: "آيس لاتيه",               price: 75,  cost: 18, stock: 140, low: 50 },
  { sku: "COL-002", cat: "cold",     name_en: "Cold Brew",         name_ar: "كولد برو",                price: 70,  cost: 16, stock: 88,  low: 40 },
  { sku: "COL-003", cat: "cold",     name_en: "Iced Americano",    name_ar: "آيس أمريكانو",            price: 55,  cost: 12, stock: 120, low: 40 },
  { sku: "COL-004", cat: "cold",     name_en: "Affogato",          name_ar: "أفوجاتو",                 price: 90,  cost: 28, stock: 42,  low: 30 },
  // Beans
  { sku: "BNS-001", cat: "beans",    name_en: "Yirgacheffe 250g",  name_ar: "يرغاتشيف ٢٥٠ جم",         price: 240, cost: 96, stock: 14,  low: 20 },
  { sku: "BNS-002", cat: "beans",    name_en: "Sidamo 250g",       name_ar: "سيدامو ٢٥٠ جم",           price: 220, cost: 88, stock: 28,  low: 20 },
  { sku: "BNS-003", cat: "beans",    name_en: "Espresso Blend 1kg", name_ar: "خلطة إسبريسو ١ كجم",     price: 480, cost: 180, stock: 11, low: 16 },
  // Pastries
  { sku: "PST-001", cat: "pastry",   name_en: "Croissant",         name_ar: "كرواسون",                 price: 45,  cost: 14, stock: 26,  low: 15 },
  { sku: "PST-002", cat: "pastry",   name_en: "Pain au Chocolat",  name_ar: "بان أو شوكولا",           price: 55,  cost: 18, stock: 18,  low: 15 },
  { sku: "PST-003", cat: "pastry",   name_en: "Date & Tahini Bun", name_ar: "خبز التمر والطحينة",      price: 50,  cost: 16, stock: 22,  low: 15 },
  { sku: "PST-004", cat: "pastry",   name_en: "Basbousa Slice",    name_ar: "بسبوسة (شريحة)",          price: 40,  cost: 11, stock: 30,  low: 15 },
];

// One cashier per branch (from data.js STAFF, plus owner)
export const STAFF = [
  { email: "hala@bayt-coffee.test",   name: "Hala Mansour",   branch_code: "heliopolis", role: "cashier" as const },
  { email: "mariam@bayt-coffee.test", name: "Mariam Saleh",   branch_code: "maadi",      role: "cashier" as const },
  { email: "tamer@bayt-coffee.test",  name: "Tamer Khaled",   branch_code: "zamalek",    role: "cashier" as const },
  { email: "yousef@bayt-coffee.test", name: "Yousef El-Sayed", branch_code: "newcairo",   role: "cashier" as const },
  { email: "layla@bayt-coffee.test",  name: "Layla Farouk",   branch_code: "sheikhzayed", role: "cashier" as const },
];

export const CUSTOMERS = [
  { code: "C-001", name: "Nadia Hosny",  phone: "+201001234567", email: "nadia@example.com" },
  { code: "C-002", name: "Karim Saber",  phone: "+201005554321", email: "karim@example.com" },
  { code: "C-003", name: "Aya Mostafa",  phone: "+201009998877", email: "aya@example.com" },
];

// Sample transaction matching RECENT_TX TX-94819: zamalek, Tamer, 4 items, 320 EGP, bank transfer, pending
export const SAMPLE_SALE = {
  code: "TX-94819",
  branch_code: "zamalek",
  cashier_email: "tamer@bayt-coffee.test",
  customer_code: "C-001",
  lines: [
    { sku: "ESP-006", qty: 2 }, // 2x Latte
    { sku: "POV-001", qty: 1 }, // 1x Yirgacheffe V60
    { sku: "PST-001", qty: 1 }, // 1x Croissant
  ],
};
