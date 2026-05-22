// Mock product categories — shared by POS and Inventory.
// TODO: replace with API call when backend ships (tasks.md 1.8).

export type Category = {
  id: string;
  name: string;
  nameAr: string;
  count: number;
};

export const PRODUCT_CATEGORIES: Category[] = [
  { id: "espresso", name: "Espresso", nameAr: "إسبريسو", count: 6 },
  { id: "pourover", name: "Pour-over", nameAr: "تقطير يدوي", count: 4 },
  { id: "cold", name: "Cold drinks", nameAr: "مشروبات باردة", count: 4 },
  { id: "beans", name: "Whole bean", nameAr: "حبوب كاملة", count: 3 },
  { id: "pastry", name: "Pastries", nameAr: "معجنات", count: 4 },
];
