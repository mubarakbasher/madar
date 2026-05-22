// Mock product catalog — shared by POS and Inventory.
// Ported from docs/design/project/data.js — Bayt Coffee Co. (Cairo).
// TODO: replace with API call when backend ships (tasks.md 1.8).

export type Product = {
  id: string;
  sku: string;
  cat: string;
  name: string;
  /** Sell price in EGP. Stored as a plain integer here; backend will switch to BigInt cents. */
  price: number;
  /** Cost basis in EGP. Same shape as `price`. */
  cost: number;
  /** Units on hand. */
  stock: number;
  /** Reorder point — below this is "low stock". */
  low: number;
  /** Weekly velocity — units sold per week (mock metric). */
  vel: number;
  /** Tile gradient seed color. */
  color: string;
  /** Relative storage path of the product image (or null when not set). */
  image_url?: string | null;
};

export const PRODUCTS: Product[] = [
  { id: "p01", sku: "ESP-001", cat: "espresso", name: "Espresso", price: 35, cost: 8, stock: 240, low: 60, vel: 38, color: "#3D2817" },
  { id: "p02", sku: "ESP-002", cat: "espresso", name: "Doppio", price: 45, cost: 10, stock: 180, low: 60, vel: 22, color: "#2E1B0F" },
  { id: "p03", sku: "ESP-003", cat: "espresso", name: "Cortado", price: 55, cost: 14, stock: 120, low: 40, vel: 31, color: "#6B4226" },
  { id: "p04", sku: "ESP-004", cat: "espresso", name: "Flat White", price: 65, cost: 16, stock: 96, low: 40, vel: 44, color: "#8A5A3B" },
  { id: "p05", sku: "ESP-005", cat: "espresso", name: "Cappuccino", price: 65, cost: 16, stock: 110, low: 40, vel: 28, color: "#A87653" },
  { id: "p06", sku: "ESP-006", cat: "espresso", name: "Latte", price: 70, cost: 17, stock: 88, low: 40, vel: 41, color: "#C49A78" },
  { id: "p10", sku: "POV-001", cat: "pourover", name: "Yirgacheffe V60", price: 85, cost: 22, stock: 22, low: 30, vel: 18, color: "#5B3520" },
  { id: "p11", sku: "POV-002", cat: "pourover", name: "Sidamo Pour-over", price: 80, cost: 21, stock: 34, low: 30, vel: 15, color: "#46291B" },
  { id: "p12", sku: "POV-003", cat: "pourover", name: "Kenya AA Chemex", price: 95, cost: 26, stock: 18, low: 24, vel: 9, color: "#3A2317" },
  { id: "p13", sku: "POV-004", cat: "pourover", name: "Geisha (single)", price: 180, cost: 62, stock: 8, low: 12, vel: 4, color: "#7A4A2F" },
  { id: "p20", sku: "COL-001", cat: "cold", name: "Iced Latte", price: 75, cost: 18, stock: 140, low: 50, vel: 35, color: "#C9A78A" },
  { id: "p21", sku: "COL-002", cat: "cold", name: "Cold Brew", price: 70, cost: 16, stock: 88, low: 40, vel: 26, color: "#3F2718" },
  { id: "p22", sku: "COL-003", cat: "cold", name: "Iced Americano", price: 55, cost: 12, stock: 120, low: 40, vel: 22, color: "#1F1410" },
  { id: "p23", sku: "COL-004", cat: "cold", name: "Affogato", price: 90, cost: 28, stock: 42, low: 30, vel: 12, color: "#8A6E58" },
  { id: "p30", sku: "BNS-001", cat: "beans", name: "Yirgacheffe 250g", price: 240, cost: 96, stock: 14, low: 20, vel: 6, color: "#5B3520" },
  { id: "p31", sku: "BNS-002", cat: "beans", name: "Sidamo 250g", price: 220, cost: 88, stock: 28, low: 20, vel: 8, color: "#46291B" },
  { id: "p32", sku: "BNS-003", cat: "beans", name: "Espresso Blend 1kg", price: 480, cost: 180, stock: 11, low: 16, vel: 4, color: "#2E1B0F" },
  { id: "p40", sku: "PST-001", cat: "pastry", name: "Croissant", price: 45, cost: 14, stock: 26, low: 15, vel: 28, color: "#D4A574" },
  { id: "p41", sku: "PST-002", cat: "pastry", name: "Pain au Chocolat", price: 55, cost: 18, stock: 18, low: 15, vel: 22, color: "#6B4226" },
  { id: "p42", sku: "PST-003", cat: "pastry", name: "Date & Tahini Bun", price: 50, cost: 16, stock: 22, low: 15, vel: 19, color: "#A87653" },
  { id: "p43", sku: "PST-004", cat: "pastry", name: "Basbousa Slice", price: 40, cost: 11, stock: 30, low: 15, vel: 16, color: "#C49A78" },
];
