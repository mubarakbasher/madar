// Sample data for Madar prototype — Bayt Coffee Co. (specialty coffee chain, Cairo)

const BRANCHES = [
  { id: 'maadi', name: 'Maadi', name_ar: 'المعادي', lat: 38, lng: 62, opened: '2022', staff: 11, status: 'open',
    today: 8420, weekRev: 47800, deltaWk: 12.4, peakHr: '8 AM', topProduct: 'Yirgacheffe V60' },
  { id: 'zamalek', name: 'Zamalek', name_ar: 'الزمالك', lat: 28, lng: 38, opened: '2021', staff: 9, status: 'open',
    today: 5210, weekRev: 39200, deltaWk: -4.1, peakHr: '11 AM', topProduct: 'Flat White' },
  { id: 'heliopolis', name: 'Heliopolis', name_ar: 'مصر الجديدة', lat: 56, lng: 32, opened: '2023', staff: 8, status: 'open',
    today: 6840, weekRev: 41100, deltaWk: 6.8, peakHr: '9 AM', topProduct: 'Sidamo Pour-over' },
  { id: 'newcairo', name: 'New Cairo', name_ar: 'القاهرة الجديدة', lat: 78, lng: 60, opened: '2024', staff: 7, status: 'open',
    today: 4120, weekRev: 28400, deltaWk: 18.2, peakHr: '4 PM', topProduct: 'Iced Latte' },
  { id: 'sheikhzayed', name: 'Sheikh Zayed', name_ar: 'الشيخ زايد', lat: 20, lng: 78, opened: '2024', staff: 6, status: 'open',
    today: 3690, weekRev: 24800, deltaWk: 9.1, peakHr: '5 PM', topProduct: 'Cortado' },
];

const PRODUCT_CATEGORIES = [
  { id: 'espresso', name: 'Espresso', count: 8 },
  { id: 'pourover', name: 'Pour-over', count: 6 },
  { id: 'cold', name: 'Cold drinks', count: 7 },
  { id: 'beans', name: 'Whole bean', count: 12 },
  { id: 'pastry', name: 'Pastries', count: 9 },
  { id: 'merch', name: 'Merch', count: 5 },
];

const PRODUCTS = [
  // Espresso
  { id: 'p01', sku: 'ESP-001', cat: 'espresso', name: 'Espresso',          price: 35,  cost: 8,  stock: 240, low: 60, vel: 38, color: '#3D2817' },
  { id: 'p02', sku: 'ESP-002', cat: 'espresso', name: 'Doppio',            price: 45,  cost: 10, stock: 180, low: 60, vel: 22, color: '#2E1B0F' },
  { id: 'p03', sku: 'ESP-003', cat: 'espresso', name: 'Cortado',           price: 55,  cost: 14, stock: 120, low: 40, vel: 31, color: '#6B4226' },
  { id: 'p04', sku: 'ESP-004', cat: 'espresso', name: 'Flat White',        price: 65,  cost: 16, stock: 96,  low: 40, vel: 44, color: '#8A5A3B' },
  { id: 'p05', sku: 'ESP-005', cat: 'espresso', name: 'Cappuccino',        price: 65,  cost: 16, stock: 110, low: 40, vel: 28, color: '#A87653' },
  { id: 'p06', sku: 'ESP-006', cat: 'espresso', name: 'Latte',             price: 70,  cost: 17, stock: 88,  low: 40, vel: 41, color: '#C49A78' },
  // Pour-over
  { id: 'p10', sku: 'POV-001', cat: 'pourover', name: 'Yirgacheffe V60',   price: 85,  cost: 22, stock: 22,  low: 30, vel: 18, color: '#5B3520' },
  { id: 'p11', sku: 'POV-002', cat: 'pourover', name: 'Sidamo Pour-over',  price: 80,  cost: 21, stock: 34,  low: 30, vel: 15, color: '#46291B' },
  { id: 'p12', sku: 'POV-003', cat: 'pourover', name: 'Kenya AA Chemex',   price: 95,  cost: 26, stock: 18,  low: 24, vel: 9,  color: '#3A2317' },
  { id: 'p13', sku: 'POV-004', cat: 'pourover', name: 'Geisha (single)',   price: 180, cost: 62, stock: 8,   low: 12, vel: 4,  color: '#7A4A2F' },
  // Cold
  { id: 'p20', sku: 'COL-001', cat: 'cold',     name: 'Iced Latte',        price: 75,  cost: 18, stock: 140, low: 50, vel: 35, color: '#C9A78A' },
  { id: 'p21', sku: 'COL-002', cat: 'cold',     name: 'Cold Brew',         price: 70,  cost: 16, stock: 88,  low: 40, vel: 26, color: '#3F2718' },
  { id: 'p22', sku: 'COL-003', cat: 'cold',     name: 'Iced Americano',    price: 55,  cost: 12, stock: 120, low: 40, vel: 22, color: '#1F1410' },
  { id: 'p23', sku: 'COL-004', cat: 'cold',     name: 'Affogato',          price: 90,  cost: 28, stock: 42,  low: 30, vel: 12, color: '#8A6E58' },
  // Beans
  { id: 'p30', sku: 'BNS-001', cat: 'beans',    name: 'Yirgacheffe 250g',  price: 240, cost: 96, stock: 14,  low: 20, vel: 6,  color: '#5B3520' },
  { id: 'p31', sku: 'BNS-002', cat: 'beans',    name: 'Sidamo 250g',       price: 220, cost: 88, stock: 28,  low: 20, vel: 8,  color: '#46291B' },
  { id: 'p32', sku: 'BNS-003', cat: 'beans',    name: 'Espresso Blend 1kg',price: 480, cost: 180,stock: 11,  low: 16, vel: 4,  color: '#2E1B0F' },
  // Pastries
  { id: 'p40', sku: 'PST-001', cat: 'pastry',   name: 'Croissant',         price: 45,  cost: 14, stock: 26,  low: 15, vel: 28, color: '#D4A574' },
  { id: 'p41', sku: 'PST-002', cat: 'pastry',   name: 'Pain au Chocolat',  price: 55,  cost: 18, stock: 18,  low: 15, vel: 22, color: '#6B4226' },
  { id: 'p42', sku: 'PST-003', cat: 'pastry',   name: 'Date & Tahini Bun', price: 50,  cost: 16, stock: 22,  low: 15, vel: 19, color: '#A87653' },
  { id: 'p43', sku: 'PST-004', cat: 'pastry',   name: 'Basbousa Slice',    price: 40,  cost: 11, stock: 30,  low: 15, vel: 16, color: '#C49A78' },
];

const SUPPLIERS = [
  { id: 's1', name: 'Sidamo Direct',     ctry: 'Ethiopia',      reliability: 96, leadDays: 18, lastOrder: '2026-04-22', owed: 18400, items: 4, trend: 'steady',
    note: 'Origin partner — single-estate Yirgacheffe & Sidamo. On-time 96%.' },
  { id: 's2', name: 'Levant Mills',      ctry: 'Lebanon',       reliability: 88, leadDays: 7,  lastOrder: '2026-04-29', owed: 6200,  items: 8, trend: 'up',
    note: 'Pastry flour, semolina, regional dairy.' },
  { id: 's3', name: 'Cairo Dairy Co.',   ctry: 'Egypt',         reliability: 92, leadDays: 1,  lastOrder: '2026-05-07', owed: 1840,  items: 5, trend: 'steady',
    note: 'Daily milk delivery, all branches.' },
  { id: 's4', name: 'Atlas Packaging',   ctry: 'Morocco',       reliability: 74, leadDays: 21, lastOrder: '2026-04-12', owed: 11200, items: 6, trend: 'down',
    note: 'Cups, lids, bags. Quality slipping in Q2.' },
  { id: 's5', name: 'Nile Pastries',     ctry: 'Egypt',         reliability: 91, leadDays: 2,  lastOrder: '2026-05-06', owed: 4320,  items: 9, trend: 'steady',
    note: 'Daily croissants, danishes, basbousa.' },
  { id: 's6', name: 'Brew Hardware',     ctry: 'Italy',         reliability: 84, leadDays: 28, lastOrder: '2026-03-18', owed: 0,     items: 3, trend: 'steady',
    note: 'Espresso machine parts, V60 filters, scales.' },
];

const PAYMENT_METHODS = [
  { id: 'cash',  label: 'Cash',          short: 'Cash',     icon: 'cash' },
  { id: 'card',  label: 'Card terminal', short: 'Card',     icon: 'card' },
  { id: 'tx',    label: 'Bank transfer', short: 'Transfer', icon: 'bank' },
];

// AI insights — front and center
const INSIGHTS = [
  { id: 'i1', kind: 'reorder', urgency: 'high',
    headline: 'Reorder Yirgacheffe — 28 units low',
    body: 'Maadi & Heliopolis will run out in 4 days at current pace. Sidamo Direct lead time is 18 days; suggest ordering 120 units today.',
    confidence: 0.91, branches: ['maadi', 'heliopolis'], actions: ['Approve reorder', 'Adjust quantity', 'Dismiss'] },
  { id: 'i2', kind: 'anomaly', urgency: 'med',
    headline: 'Zamalek evening sales fell 31% this week',
    body: 'Drop is concentrated 6–9 PM, weekdays only. Same period last year: stable. Possibly tied to the new Korba café opening on the same street.',
    confidence: 0.82, branches: ['zamalek'], actions: ['Investigate', 'Mark as expected'] },
  { id: 'i3', kind: 'pricing', urgency: 'low',
    headline: 'Cortado is your highest-margin espresso, but third in volume',
    body: '72% margin, 18% of espresso volume. Featuring it on the favorites grid for two weeks could lift contribution by ~£8,400/month.',
    confidence: 0.74, branches: ['all'], actions: ['Run experiment', 'Dismiss'] },
  { id: 'i4', kind: 'staff', urgency: 'low',
    headline: 'Hala (Heliopolis) — fastest checkout, highest upsell rate',
    body: 'Avg 47s per ticket vs 1m12s chain average. Upsell rate 28% vs 14%. Worth pairing her with new hires next week.',
    confidence: 0.88, branches: ['heliopolis'], actions: ['Schedule training', 'Send recognition'] },
  { id: 'i5', kind: 'supplier', urgency: 'med',
    headline: 'Atlas Packaging quality is slipping',
    body: 'Defect rate doubled in the last 3 shipments (4.1% → 8.7%). Lead time also up 4 days. Consider sourcing a backup.',
    confidence: 0.79, branches: ['all'], actions: ['Review supplier', 'Find alternates'] },
];

// 30-day revenue series, per branch
function gen30(seed, base, drift) {
  const out = [];
  let v = base;
  for (let i = 0; i < 30; i++) {
    const dow = (i + 4) % 7;
    const wkd = (dow === 5 || dow === 6) ? 1.18 : 1.0;
    const noise = ((Math.sin((i + seed) * 1.31) * 0.5 + Math.cos((i + seed) * 0.7) * 0.5) * 0.12);
    v = base + drift * i + base * (noise + (wkd - 1));
    out.push(Math.max(800, Math.round(v)));
  }
  return out;
}
const REVENUE_30D = {
  total:        gen30(1, 28000, 180),
  maadi:        gen30(2, 9200,  60),
  zamalek:      gen30(3, 7400, -20),
  heliopolis:   gen30(4, 6900,  35),
  newcairo:     gen30(5, 4200,  60),
  sheikhzayed:  gen30(6, 3700,  45),
};

// Hour-of-day heatmap — 7 days × 12 hours (8am-7pm)
const HEATMAP = (function () {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const out = [];
  for (let d = 0; d < 7; d++) {
    const row = [];
    for (let h = 0; h < 12; h++) {
      // morning peak + afternoon dip + weekend bump
      const morning = Math.exp(-Math.pow((h - 1) / 1.4, 2)) * 0.9;
      const afternoon = Math.exp(-Math.pow((h - 8) / 2.2, 2)) * 0.5;
      const wkd = (d >= 5) ? 1.25 : 1.0;
      const v = (morning + afternoon) * wkd + (Math.sin(d * 7 + h * 1.3) * 0.06);
      row.push(Math.max(0.04, Math.min(1, v)));
    }
    out.push({ day: days[d], cells: row });
  }
  return out;
})();

const RECENT_TX = [
  { id: 'TX-94821', branch: 'maadi',      cashier: 'Mariam', items: 3, total: 215, method: 'cash', time: '2 min', status: 'verified' },
  { id: 'TX-94820', branch: 'maadi',      cashier: 'Mariam', items: 2, total: 140, method: 'card', time: '4 min', status: 'verified' },
  { id: 'TX-94819', branch: 'zamalek',    cashier: 'Tamer',  items: 4, total: 320, method: 'tx',   time: '6 min', status: 'pending' },
  { id: 'TX-94818', branch: 'heliopolis', cashier: 'Hala',   items: 1, total: 65,  method: 'card', time: '7 min', status: 'verified' },
  { id: 'TX-94817', branch: 'newcairo',   cashier: 'Yousef', items: 5, total: 430, method: 'tx',   time: '9 min', status: 'pending' },
  { id: 'TX-94816', branch: 'maadi',      cashier: 'Mariam', items: 2, total: 110, method: 'cash', time: '12 min', status: 'verified' },
  { id: 'TX-94815', branch: 'sheikhzayed',cashier: 'Layla',  items: 3, total: 195, method: 'card', time: '14 min', status: 'verified' },
  { id: 'TX-94814', branch: 'heliopolis', cashier: 'Hala',   items: 6, total: 510, method: 'tx',   time: '18 min', status: 'verified' },
];

const STAFF = [
  { name: 'Hala Mansour',    branch: 'heliopolis',  role: 'Cashier',     avgTicket: 47, basket: 158, upsell: 28, refund: 1.2 },
  { name: 'Mariam Saleh',    branch: 'maadi',       role: 'Lead Barista',avgTicket: 58, basket: 142, upsell: 22, refund: 1.8 },
  { name: 'Tamer Khaled',    branch: 'zamalek',     role: 'Cashier',     avgTicket: 71, basket: 124, upsell: 14, refund: 4.1 },
  { name: 'Yousef El-Sayed', branch: 'newcairo',    role: 'Cashier',     avgTicket: 64, basket: 138, upsell: 18, refund: 2.0 },
  { name: 'Layla Farouk',    branch: 'sheikhzayed', role: 'Cashier',     avgTicket: 55, basket: 132, upsell: 19, refund: 1.5 },
];

window.MADAR_DATA = {
  BRANCHES, PRODUCT_CATEGORIES, PRODUCTS, SUPPLIERS, PAYMENT_METHODS,
  INSIGHTS, REVENUE_30D, HEATMAP, RECENT_TX, STAFF
};
