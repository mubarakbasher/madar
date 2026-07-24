// Shared implementation lives in @madar/ui (packages/ui/src/currency.ts) so
// both apps use the same minor-unit-aware formatting (KWD=3, JPY=0). The
// MINOR_UNITS map there is mirrored in apps/api/src/common/currency.ts —
// keep the two in sync. This shim keeps the historical "@/lib/currency"
// import path working across the tenant app.
export {
  currencyMinorUnits,
  minorToMajor,
  majorToMinor,
  formatMoney,
  formatCurrency,
  formatNumber,
  formatNumberShort,
} from "@madar/ui";
